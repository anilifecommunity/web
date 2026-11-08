import {
  getProvider,
  planAttempts,
  PROVIDER_ORDER,
  PROVIDERS,
  resolvePlayback,
} from '../src/resolver';
import type { PlaybackOffer, ResolveRequest, SelectionPolicy } from '../src/resolver';
import { ADAPTERS } from './adapters';
import { createGateToken, gateCookie, GATE_COOKIE, readCookie, verifyGateToken, verifyTurnstile } from './gate';
import { GuardError } from './guards';
import { fail, json, parseInteger } from './http';
import { hit } from './rateLimit';

export interface Env {
  ASSETS: Fetcher;
  /** Turnstile secret key. When unset, the first-visit gate is disabled (local development). */
  TURNSTILE_SECRET?: string;
  /** HMAC key for the first-visit gate cookie. Required whenever TURNSTILE_SECRET is set. */
  GATE_SIGNING_KEY?: string;
}

const MAX_EPISODE_REF = 64;
const EPISODE_REF = /^[A-Za-z0-9._-]{1,64}$/;

function publicProviders(): unknown[] {
  return PROVIDERS.map((provider) => ({
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
  if (!(await gateEnabled(env))) return true;
  return verifyGateToken(env.GATE_SIGNING_KEY as string, readCookie(request, GATE_COOKIE));
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
  if (!EPISODE_REF.test(episodeRef) || episodeRef.length > MAX_EPISODE_REF) {
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

function parseProviderList(raw: string | null): string[] | null {
  if (raw === null) return null;
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length > 64) return null;
  if (ids.some((id) => !getProvider(id))) return null;
  return [...new Set(ids)];
}

async function handleResolve(request: Request, env: Env, url: URL): Promise<Response> {
  const productionHost = url.hostname === 'anilife.cc' || url.hostname === 'www.anilife.cc';
  if (productionHost && !(await gateEnabled(env))) {
    return fail(503, 'gate_not_configured');
  }
  if (!(await gatePassed(request, env))) {
    return fail(403, 'gate_required');
  }
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

  try {
    const result = await resolvePlayback({
      request: parsed.request,
      policy: parsed.policy,
      adapters: ADAPTERS,
      timeoutMs: 12_000,
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

async function handleGateVerify(request: Request, env: Env): Promise<Response> {
  if (!(await gateEnabled(env))) {
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
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === 'string' ? body.token : '';
  } catch {
    return fail(400, 'invalid_body');
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

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.hostname === 'www.anilife.cc') {
    return Response.redirect(`https://anilife.cc${url.pathname}${url.search}`, 301);
  }

  const path = url.pathname;

  if (!path.startsWith('/api/')) {
    // The OAuth return page is a static file, but the extensionless route would otherwise fall
    // through to the SPA shell and leave the token in the fragment unread.
    if (path === '/auth/callback' || path === '/auth/callback/') {
      const asset = new URL('/auth/callback.html', url.origin);
      return env.ASSETS.fetch(new Request(asset.toString(), request));
    }
    return env.ASSETS.fetch(request);
  }

  if (path === '/api/health' && request.method === 'GET') {
    return json({
      ok: true,
      service: 'anilife-web',
      schemaVersion: 1,
      gate: await gateEnabled(env),
      adapters: Object.keys(ADAPTERS),
    });
  }

  if (path === '/api/gate/status' && request.method === 'GET') {
    return json({ ok: true, passed: await gatePassed(request, env) });
  }

  if (path === '/api/gate/verify' && request.method === 'POST') {
    return handleGateVerify(request, env);
  }

  if (path === '/api/providers' && request.method === 'GET') {
    return json({ ok: true, providers: publicProviders() });
  }


  if (path === '/api/resolve' && request.method === 'GET') {
    return handleResolve(request, env, url);
  }

  if (path.startsWith('/api/')) {
    return fail(404, 'not_found');
  }

  return env.ASSETS.fetch(request);
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://graphql.anilist.co https://cdn.jsdelivr.net https://raw.githubusercontent.com https://api.aniskip.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://flixcloud.cc https://*.flixcloud.cc https://challenges.cloudflare.com",
  "form-action 'self' https://anilist.co",
  "manifest-src 'self'",
].join('; ');

function securityHeaders(request: Request): Record<string, string> {
  const url = new URL(request.url);
  const preview = url.hostname.endsWith('.workers.dev');
  return {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'X-Frame-Options': 'DENY',
    ...(preview ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    ...(url.protocol === 'https:'
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

/** Applies the security policy to every response, including static assets. */
function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders(request))) {
    headers.set(name, value);
  }
  if (new URL(request.url).pathname.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  if (new URL(request.url).pathname.startsWith('/auth/callback')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return withSecurityHeaders(await handleRequest(request, env), request);
    } catch {
      // Never leak stack traces, upstream URLs or credentials to the caller.
      return withSecurityHeaders(fail(500, 'internal_error'), request);
    }
  },
};
