import {
  getProvider,
  planAttempts,
  PROVIDER_ORDER,
  providersForWeb,
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
  return providersForWeb(false).map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    catalogue: provider.catalogue,
    capabilities: provider.capabilities,
    webStatus: provider.webStatus,
    rightsStatus: provider.rightsStatus,
    declaredLanguage: provider.declaredLanguage ?? null,
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
    ? { selectedProvider: provider, allowFallback, hideAdult }
    : { allowFallback: true, hideAdult, preferredOrder: PROVIDER_ORDER };

  return { request, policy };
}

async function handleResolve(request: Request, env: Env, url: URL): Promise<Response> {
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
  const path = url.pathname;

  if (!path.startsWith('/api/')) {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch {
      // Never leak stack traces, upstream URLs or credentials to the caller.
      return fail(500, 'internal_error');
    }
  },
};
