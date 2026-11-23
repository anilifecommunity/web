import {
  getProvider,
  planAttempts,
  PROVIDER_ORDER,
  PROVIDERS,
  DOWNSTREAMS,
  resolvePlayback,
} from '../src/resolver';
import type { PlaybackOffer, ResolveRequest, SelectionPolicy } from '../src/resolver';
import { ADAPTERS } from './adapters';
import { createGateToken, gateCookie, GATE_COOKIE, readCookie, verifyGateToken, verifyTurnstile } from './gate';
import {
  GuardError,
  RequestBodyError,
  readRequestJsonCapped,
  safeFetch,
} from './guards';
import { fail, json, parseInteger } from './http';
import { hit } from './rateLimit';
import { getAniListEpisodeAvailability, type EpisodeAvailability } from './anilist';
import { protectedRequestAllowed, securityHeaders } from './security';
import { createWatchSession, verifyWatchSession, type WatchFailure } from './watchSession';
import {
  getStableReleaseIndex,
  publishStableReleaseIndex,
  type ReleaseIndexEnv,
} from './releaseIndex';

export interface Env extends ReleaseIndexEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Turnstile secret key. When unset, the first-visit gate is disabled (local development). */
  TURNSTILE_SECRET?: string;
  /** HMAC key for the first-visit gate cookie. Required whenever TURNSTILE_SECRET is set. */
  GATE_SIGNING_KEY?: string;
  /** HMAC key for opaque browser-bound watch authorizations. */
  WATCH_TOKEN_KEY?: string;
  /** Previous source secret accepted only while rotating WATCH_TOKEN_KEY. */
  WATCH_TOKEN_PREVIOUS_KEY?: string;
  APP_ENV?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
}

const DISCORD_CLIENT_ID = '1567279187893551185';
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_HOSTS = new Set(['discord.com']);

const MAX_REQUEST_JSON_BYTES = 16 * 1024;
const EPISODE_REF = /^[1-9]\d{0,5}$/;

function releaseFailure(availability: EpisodeAvailability): Response | null {
  if (availability === 'available') return null;
  return fail(
    availability === 'unknown' ? 503 : 409,
    availability === 'unknown' ? 'release_status_unavailable' : 'episode_unavailable'
  );
}

function publicProviders(hideAdult = true): unknown[] {
  return PROVIDERS.filter(
    (provider) => !hideAdult || !provider.capabilities.adultOnly
  ).map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    catalogue: provider.catalogue,
    capabilities: provider.capabilities,
    webStatus: provider.webStatus,
    rightsStatus: provider.rightsStatus,
    declaredLanguage: provider.declaredLanguage ?? null,
    implemented: provider.implemented === true,
  }));
}

async function gateEnabled(env: Env): Promise<boolean> {
  return Boolean(env.TURNSTILE_SECRET && env.GATE_SIGNING_KEY);
}

async function gatePassed(request: Request, env: Env): Promise<boolean> {
  return Boolean(await gateSessionToken(request, env));
}

async function gateSessionToken(request: Request, env: Env): Promise<string | undefined> {
  if (!(await gateEnabled(env))) return env.APP_ENV === 'production' ? undefined : 'local-development';
  const secret = env.GATE_SIGNING_KEY as string;
  const cookie = readCookie(request, GATE_COOKIE);
  if (cookie && await verifyGateToken(secret, cookie)) return cookie;
  const header = request.headers.get('X-Anilife-Gate') ?? undefined;
  return header && await verifyGateToken(secret, header) ? header : undefined;
}

function watchSecrets(env: Env): string[] {
  const current = env.WATCH_TOKEN_KEY ?? (env.APP_ENV === 'production' ? '' : 'local-watch-session-key');
  return [current, env.WATCH_TOKEN_PREVIOUS_KEY ?? ''].filter(Boolean);
}

function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'anonymous';
}

function parseResolveRequest(url: URL): { request: ResolveRequest; policy: SelectionPolicy } | { error: string } {
  const aniListId = parseInteger(url.searchParams.get('aniListId'));
  if (!aniListId || aniListId < 1 || aniListId > 1_000_000_000) {
    return { error: 'invalid_aniListId' };
  }

  const malIdRaw = url.searchParams.get('malId');
  const malId = malIdRaw ? parseInteger(malIdRaw) : null;
  if (malIdRaw && (!malId || malId < 1)) return { error: 'invalid_malId' };

  const episodeRef = (url.searchParams.get('episode') ?? '1').trim();
  if (!EPISODE_REF.test(episodeRef) || Number(episodeRef) > 100_000) {
    return { error: 'invalid_episode' };
  }

  const audioRaw = (url.searchParams.get('audio') ?? 'sub').toLowerCase();
  if (!['sub', 'dub', 'multi', 'unknown'].includes(audioRaw)) return { error: 'invalid_audio' };

  const variantRaw = url.searchParams.get('variant');
  if (variantRaw && !['soft', 'hard'].includes(variantRaw)) return { error: 'invalid_variant' };

  const provider = (url.searchParams.get('provider') ?? '').trim();
  if (provider && !getProvider(provider)) return { error: 'unknown_provider' };

  const order = parseProviderList(url.searchParams.get('order'));
  if (order === null) return { error: 'invalid_order' };

  const enabledRaw = url.searchParams.get('enabled');
  const enabled = enabledRaw === null ? null : parseProviderList(enabledRaw);
  if (enabledRaw !== null && enabled === null) return { error: 'invalid_enabled' };

  const allowFallback = url.searchParams.get('fallback') === '1';
  const hideAdult = url.searchParams.get('hideAdult') !== '0';

  const request: ResolveRequest = {
    aniListId,
    malId: malId ?? null,
    episodeRef,
    audio: audioRaw as ResolveRequest['audio'],
    ...(url.searchParams.get('lang') ? { subtitleLanguage: String(url.searchParams.get('lang')) } : {}),
    ...(variantRaw ? { variant: variantRaw as 'soft' | 'hard' } : {}),
    ...(url.searchParams.get('quality') ? { qualityCeiling: String(url.searchParams.get('quality')) } : {}),
  };

  const policy: SelectionPolicy = provider
    ? {
        selectedProvider: provider,
        allowFallback,
        hideAdult,
        ...(enabled ? { enabled } : {}),
        ...(order && order.length > 0 ? { preferredOrder: order } : {}),
      }
    : {
        allowFallback: true,
        hideAdult,
        ...(enabled ? { enabled } : {}),
        preferredOrder: order && order.length > 0 ? order : PROVIDER_ORDER,
      };

  return { request, policy };
}

function parseProviderList(raw: string | null): string[] | null | undefined {
  if (raw === null) return undefined;
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length > 64) return null;
  if (ids.some((id) => !getProvider(id))) return null;
  return [...new Set(ids)];
}

const WATCH_REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WATCH_TAG = /^[0-9a-f]{12}$/;

function watchFailure(reason: WatchFailure): Response {
  void reason;
  return fail(403, 'watch_session_invalid');
}

async function readWatchBody(request: Request): Promise<{
  reference: string;
  tag: string;
  aniListId: number;
  episode: number;
} | null> {
  const body = await readRequestJsonCapped<Record<string, unknown>>(request, MAX_REQUEST_JSON_BYTES);
  const reference = typeof body.reference === 'string' ? body.reference : '';
  const tag = typeof body.tag === 'string' ? body.tag : '';
  const aniListId = typeof body.aniListId === 'number' ? body.aniListId : 0;
  const episode = typeof body.episode === 'number' ? body.episode : 0;
  if (
    !WATCH_REFERENCE.test(reference) ||
    !WATCH_TAG.test(tag) ||
    !Number.isSafeInteger(aniListId) || aniListId < 1 || aniListId > 1_000_000_000 ||
    !Number.isSafeInteger(episode) || episode < 1 || episode > 100_000
  ) return null;
  return { reference, tag, aniListId, episode };
}

function requestBodyFailure(error: unknown): Response {
  if (error instanceof RequestBodyError) {
    if (error.reason === 'request_too_large') return fail(413, 'payload_too_large');
    if (error.reason === 'invalid_content_type') return fail(415, 'unsupported_media_type');
  }
  return fail(400, 'invalid_body');
}

async function handleWatchCreate(request: Request, env: Env): Promise<Response> {
  if (!protectedRequestAllowed(request)) return fail(403, 'cross_origin_denied');
  const sessionToken = await gateSessionToken(request, env);
  if (!sessionToken) return fail(401, 'verification_required');
  const [secret] = watchSecrets(env);
  if (!secret) return fail(503, 'watch_sessions_not_configured');
  const limited = hit(`watch:create:${clientKey(request)}`, 20, 60_000);
  if (!limited.allowed) {
    return json(
      { ok: false, error: 'rate_limited', retryAfterSec: limited.retryAfterSec },
      429,
      { 'Retry-After': String(limited.retryAfterSec) },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await readRequestJsonCapped<Record<string, unknown>>(request, MAX_REQUEST_JSON_BYTES);
  } catch (error) {
    return requestBodyFailure(error);
  }
  const aniListId = typeof body.aniListId === 'number' ? body.aniListId : 0;
  const episode = typeof body.episode === 'number' ? body.episode : 0;
  if (
    !Number.isSafeInteger(aniListId) || aniListId < 1 || aniListId > 1_000_000_000 ||
    !Number.isSafeInteger(episode) || episode < 1 || episode > 100_000
  ) return fail(400, 'invalid_watch_target');
  const releaseError = releaseFailure(await getAniListEpisodeAvailability(aniListId, episode, 8_000));
  if (releaseError) return releaseError;
  const created = await createWatchSession(secret, sessionToken, aniListId);
  return json({
    ok: true,
    ...created,
    aniListId,
    episode,
    path: `/watch/${created.reference}/episode-${episode}-${created.tag}`,
  });
}

async function handleWatchValidate(request: Request, env: Env): Promise<Response> {
  if (!protectedRequestAllowed(request)) return fail(403, 'cross_origin_denied');
  const sessionToken = await gateSessionToken(request, env);
  if (!sessionToken) return fail(401, 'verification_required');
  let body: Awaited<ReturnType<typeof readWatchBody>>;
  try {
    body = await readWatchBody(request);
  } catch (error) {
    return requestBodyFailure(error);
  }
  if (!body) return fail(400, 'invalid_watch_session');
  const secrets = watchSecrets(env);
  if (secrets.length === 0) return fail(503, 'watch_sessions_not_configured');
  const verified = await verifyWatchSession(
    secrets,
    sessionToken,
    { reference: body.reference, tag: body.tag, aniListId: body.aniListId }
  );
  if (!verified.ok) return watchFailure(verified.reason);
  const releaseError = releaseFailure(
    await getAniListEpisodeAvailability(verified.aniListId, body.episode, 8_000)
  );
  if (releaseError) return releaseError;
  return json({
    ok: true,
    aniListId: verified.aniListId,
    episode: body.episode,
    expiresAt: verified.expiresAt,
  });
}

async function handleResolve(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.APP_ENV === 'production' && !(await gateEnabled(env))) {
    return fail(503, 'gate_not_configured');
  }
  if (!(await gatePassed(request, env))) {
    return fail(403, 'gate_required');
  }
  if (!protectedRequestAllowed(request)) return fail(403, 'cross_origin_denied');
  const limited = hit(`resolve:${clientKey(request)}`, 30, 60_000);
  if (!limited.allowed) {
    return json(
      { ok: false, error: 'rate_limited', retryAfterSec: limited.retryAfterSec },
      429,
      { 'Retry-After': String(limited.retryAfterSec) }
    );
  }

  const parsed = parseResolveRequest(url);
  if ('error' in parsed) return fail(400, parsed.error);

  const sessionToken = await gateSessionToken(request, env);
  const reference = request.headers.get('X-Anilife-Watch-Reference') ?? '';
  const tag = request.headers.get('X-Anilife-Watch-Tag') ?? '';
  if (!sessionToken || !WATCH_REFERENCE.test(reference) || !WATCH_TAG.test(tag)) {
    return fail(401, 'watch_session_required');
  }
  const secrets = watchSecrets(env);
  if (secrets.length === 0) return fail(503, 'watch_sessions_not_configured');
  const verified = await verifyWatchSession(
    secrets,
    sessionToken,
    {
      reference,
      tag,
      aniListId: parsed.request.aniListId,
    }
  );
  if (!verified.ok) return watchFailure(verified.reason);
  const releaseError = releaseFailure(
    await getAniListEpisodeAvailability(parsed.request.aniListId, Number(parsed.request.episodeRef), 8_000)
  );
  if (releaseError) return releaseError;

  try {
    const result = await resolvePlayback({
      request: parsed.request,
      policy: parsed.policy,
      adapters: ADAPTERS,
      timeoutMs: 12_000,
      totalTimeoutMs: 20_000,
    });

    if (!result.ok) {
      return json(
        {
          ok: false,
          error: result.reason,
          androidCode: result.androidCode,
          attempts: result.attempts,
        },
        404
      );
    }

    const offer: PlaybackOffer = result.offer;
    return json({ ok: true, offer, attempts: result.attempts });
  } catch (error) {
    if (error instanceof GuardError) {
      return fail(502, 'upstream_unavailable');
    }
    return fail(500, 'resolver_error');
  }
}

async function handleGateVerify(request: Request, env: Env): Promise<Response> {  if (!(await gateEnabled(env))) {
    return json({ ok: true, bypassed: true });
  }

  const limited = hit(`gate:${clientKey(request)}`, 10, 60_000);
  if (!limited.allowed) {
    return json({ ok: false, error: 'rate_limited' }, 429, {
      'Retry-After': String(limited.retryAfterSec),
    });
  }

  let token = '';
  try {
    const body = await readRequestJsonCapped<{ token?: unknown }>(request, MAX_REQUEST_JSON_BYTES);
    token = typeof body.token === 'string' ? body.token : '';
  } catch (error) {
    return requestBodyFailure(error);
  }
  if (!token || token.length > 4096) return fail(400, 'invalid_token');

  const remoteIp = request.headers.get('CF-Connecting-IP');
  const result = await verifyTurnstile(env.TURNSTILE_SECRET as string, token, remoteIp);
  if (!result.success) {
    return json({ ok: false, error: 'turnstile_failed' }, 403);
  }

  const gate = await createGateToken(env.GATE_SIGNING_KEY as string);
  return json({ ok: true }, 200, { 'Set-Cookie': gateCookie(gate) });
}

async function postDiscordToken(form: URLSearchParams): Promise<{
  ok: boolean;
  status: number;
  data: {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };
}> {
  const response = await safeFetch(
    'https://discord.com/api/oauth2/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    },
    { allowedHosts: DISCORD_HOSTS, timeoutMs: 8_000, maxBytes: 16_384 }
  );
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };
  return { ok: response.ok, status: response.status, data };
}

function discordTokenResponse(data: {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}): Response {
  return json({
    ok: true,
    access_token: data.access_token,
    expires_in: data.expires_in,
    scope: data.scope,
    token_type: data.token_type,
  });
}

async function handleDiscordToken(request: Request, env: Env): Promise<Response> {
  if (!protectedRequestAllowed(request)) return fail(403, 'cross_origin_denied');
  const limited = hit(`discord:token:${clientKey(request)}`, 20, 60_000);
  if (!limited.allowed) {
    return json(
      { ok: false, error: 'rate_limited', retryAfterSec: limited.retryAfterSec },
      429,
      { 'Retry-After': String(limited.retryAfterSec) }
    );
  }

  let body: { code?: unknown; codeVerifier?: unknown };
  try {
    body = await readRequestJsonCapped<{ code?: unknown; codeVerifier?: unknown }>(
      request,
      MAX_REQUEST_JSON_BYTES
    );
  } catch (error) {
    return requestBodyFailure(error);
  }
  if (typeof body.code !== 'string' || body.code.length === 0 || body.code.length > 512) {
    return fail(400, 'invalid_code');
  }
  const verifier =
    typeof body.codeVerifier === 'string' &&
    body.codeVerifier.length >= 43 &&
    body.codeVerifier.length <= 128 &&
    /^[A-Za-z0-9._~-]+$/.test(body.codeVerifier)
      ? body.codeVerifier
      : null;
  if (!verifier) return fail(400, 'invalid_verifier');

  const clientId = env.DISCORD_CLIENT_ID ?? DISCORD_CLIENT_ID;
  const base = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code: body.code,
    code_verifier: verifier,
  });

  let lastError = 'discord_token_failed';
  if (env.DISCORD_CLIENT_SECRET) {
    const confidential = new URLSearchParams(base);
    confidential.set('client_secret', env.DISCORD_CLIENT_SECRET);
    const first = await postDiscordToken(confidential);
    if (first.ok && typeof first.data.access_token === 'string') {
      return discordTokenResponse(first.data);
    }
    lastError = first.data.error ?? lastError;
    if (first.data.error !== 'invalid_client') {
      return fail(502, 'discord_token_failed', { discordError: lastError.slice(0, 64) });
    }
  }

  // Public-client fallback: Discord accepts PKCE without a secret when the application has
  // Public Client enabled. The verifier never leaves the Worker in a response.
  const publicClient = new URLSearchParams(base);
  const second = await postDiscordToken(publicClient);
  if (second.ok && typeof second.data.access_token === 'string') {
    return discordTokenResponse(second.data);
  }
  lastError = second.data.error ?? lastError;
  return fail(502, 'discord_token_failed', { discordError: lastError.slice(0, 64) });
}

async function handleDiscordGate(request: Request, env: Env): Promise<Response> {
  if (!protectedRequestAllowed(request)) return fail(403, 'cross_origin_denied');
  if (!(await gateEnabled(env))) {
    return json({ ok: true, bypassed: true });
  }

  const limited = hit(`gate:discord:${clientKey(request)}`, 10, 60_000);
  if (!limited.allowed) {
    return json(
      { ok: false, error: 'rate_limited', retryAfterSec: limited.retryAfterSec },
      429,
      { 'Retry-After': String(limited.retryAfterSec) }
    );
  }

  let body: { accessToken?: unknown };
  try {
    body = await readRequestJsonCapped<{ accessToken?: unknown }>(request, MAX_REQUEST_JSON_BYTES);
  } catch (error) {
    return requestBodyFailure(error);
  }
  if (
    typeof body.accessToken !== 'string' ||
    body.accessToken.length === 0 ||
    body.accessToken.length > 4096
  ) {
    return fail(400, 'invalid_token');
  }

  const response = await safeFetch(
    `${DISCORD_API}/users/@me`,
    { headers: { Authorization: `Bearer ${body.accessToken}` } },
    { allowedHosts: DISCORD_HOSTS, timeoutMs: 8_000, maxBytes: 16_384 }
  );

  if (!response.ok) return fail(401, 'discord_auth_failed');

  const user = (await response.json().catch(() => ({}))) as { id?: string; username?: string };
  const gate = await createGateToken(env.GATE_SIGNING_KEY as string);
  return json(
    {
      ok: true,
      user: {
        id: typeof user.id === 'string' ? user.id : null,
        username: typeof user.username === 'string' ? user.username : null,
      },
      gate,
    },
    200,
    { 'Set-Cookie': gateCookie(gate, 'None') }
  );
}

const API_METHODS = new Map<string, string>([
  ['/api/health', 'GET'],
  ['/api/gate/status', 'GET'],
  ['/api/gate/verify', 'POST'],
  ['/api/gate/discord', 'POST'],
  ['/api/discord/token', 'POST'],
  ['/api/watch/session', 'POST'],
  ['/api/watch/session/validate', 'POST'],
  ['/api/providers', 'GET'],
  ['/api/resolve', 'GET'],
]);

const STATIC_PATHS = new Set([
  '/auth/callback',
  '/auth/callback/',
  '/auth/callback.html',
  '/auth/callback.js',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sw.js',
  '/theme-init.js',
]);

export function isAppNavigationPath(pathname: string): boolean {
  let path = pathname;
  if (path === '/activity') return true;
  if (path.startsWith('/activity/')) path = path.slice('/activity'.length);
  if (['/', '/home', '/discover', '/search', '/schedule', '/library', '/mylist', '/downloads', '/settings', '/profiles'].includes(path)) return true;
  if (/^\/anime\/[^/]+(?:\/watch\/[1-9]\d*)?$/.test(path)) return true;
  return /^\/watch\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/episode-[1-9]\d*-[0-9a-f]{12}$/i.test(path);
}

function methodNotAllowed(allow: string): Response {
  return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: allow });
}

async function navigationNotFound(request: Request, env: Env): Promise<Response> {
  const url = new URL('/index.html', request.url);
  const shell = await env.ASSETS.fetch(new Request(url, { headers: { Accept: 'text/html' } }));
  const headers = new Headers(shell.headers);
  headers.set('Cache-Control', 'no-cache');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(request.method === 'HEAD' ? null : shell.body, { status: 404, headers });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.hostname === 'www.anilife.cc') {
    return Response.redirect(`https://anilife.cc${url.pathname}${url.search}`, 301);
  }

  const path = url.pathname;

  if (path === '/downloads/index.json') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return getStableReleaseIndex(request, env);
  }

  if (path === '/internal/releases/stable') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    return publishStableReleaseIndex(request, env);
  }

  if (!path.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed('GET, HEAD');
    // The OAuth return page is a static file, but the extensionless route would otherwise fall
    // through to the SPA shell and leave the token in the fragment unread.
    if (path === '/auth/callback' || path === '/auth/callback/') {
      const asset = new URL('/auth/callback.html', url.origin);
      return env.ASSETS.fetch(new Request(asset.toString(), request));
    }
    if (isAppNavigationPath(path) || STATIC_PATHS.has(path) || path.startsWith('/assets/')) {
      return env.ASSETS.fetch(request);
    }
    return navigationNotFound(request, env);
  }

  const allowedMethod = API_METHODS.get(path);
  if (allowedMethod && request.method !== allowedMethod) return methodNotAllowed(allowedMethod);

  if (path === '/api/health') {
    return json({
      ok: true,
      service: 'anilife-web',
      schemaVersion: 1,
      gate: await gateEnabled(env),
      adapters: Object.keys(ADAPTERS),
    });
  }

  if (path === '/api/gate/status') {
    return json({ ok: true, passed: await gatePassed(request, env) });
  }

  if (path === '/api/gate/verify') {
    return handleGateVerify(request, env);
  }

  if (path === '/api/gate/discord') {
    return handleDiscordGate(request, env);
  }

  if (path === '/api/discord/token') {
    return handleDiscordToken(request, env);
  }

  if (path === '/api/watch/session') {
    return handleWatchCreate(request, env);
  }

  if (path === '/api/watch/session/validate') {
    return handleWatchValidate(request, env);
  }

  if (path === '/api/providers') {
    return json({ ok: true, providers: publicProviders(), downstreams: DOWNSTREAMS });
  }


  if (path === '/api/resolve') {
    return handleResolve(request, env, url);
  }

  if (path.startsWith('/api/')) {
    return fail(404, 'not_found');
  }

  return env.ASSETS.fetch(request);
}

/** Applies the security policy to every response, including static assets. */
function withSecurityHeaders(response: Response, request: Request, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', requestId);
  if (response.status >= 400) headers.set('X-Anilife-Error-Class', errorClass(response.status));
  for (const [name, value] of Object.entries(securityHeaders(request))) {
    headers.set(name, value);
  }
  if (new URL(request.url).pathname.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  if (
    new URL(request.url).pathname === '/sw.js' ||
    request.headers.get('Sec-Fetch-Mode') === 'navigate'
  ) {
    headers.set('Cache-Control', 'no-cache');
  }
  if (new URL(request.url).pathname.startsWith('/auth/callback')) {
    headers.set('Cache-Control', 'no-store');
  }
  const path = new URL(request.url).pathname;
  if (path.startsWith('/watch/') || path.startsWith('/activity/watch/')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function errorClass(status: number): string {
  if (status === 429) return 'rate_limit';
  if (status >= 500) return status === 500 ? 'server' : 'upstream';
  if (status === 401 || status === 403) return 'access';
  return 'request';
}

function routeClass(request: Request): string {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/watch/')) return 'watch';
  if (path === '/api/resolve') return 'resolver';
  if (path.startsWith('/api/gate/')) return 'gate';
  if (path.startsWith('/api/discord/')) return 'discord';
  if (path.startsWith('/internal/releases/')) return 'release_publisher';
  if (path === '/downloads/index.json') return 'release_index';
  if (path.startsWith('/api/')) return 'api';
  return 'asset';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      return withSecurityHeaders(await handleRequest(request, env), request, requestId);
    } catch (error) {
      // Never leak stack traces, upstream URLs or credentials to the caller.
      const upstream = error instanceof GuardError;
      const timedOut = upstream && error.reason === 'timeout';
      const status = timedOut ? 504 : upstream ? 502 : 500;
      const code = timedOut ? 'upstream_timeout' : upstream ? 'upstream_unavailable' : 'internal_error';
      console.error(JSON.stringify({
        event: 'request_failed',
        requestId,
        route: routeClass(request),
        category: errorClass(status),
      }));
      return withSecurityHeaders(fail(status, code, { requestId }), request, requestId);
    }
  },
};
