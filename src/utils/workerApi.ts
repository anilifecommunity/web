import type { PlaybackOffer } from '../resolver';
import { recordDiagnostic } from '../data/diagnostics';

export interface ResolveParams {
  provider?: string;
  aniListId: number;
  malId?: number | null;
  episode: string | number;
  audio: 'sub' | 'dub' | 'multi' | 'unknown';
  variant?: 'soft' | 'hard';
  lang?: string;
  quality?: string;
  fallback?: boolean;
  order?: string[];
  enabled?: string[];
  watchSession?: WatchSession;
}

export interface WatchSession {
  reference: string;
  tag: string;
  token: string;
  aniListId: number;
  episode: number;
  expiresAt: number;
}

export interface ResolveAttempt {
  providerId: string;
  ok: boolean;
  reason?: string;
  androidCode?: string;
}

export type ResolveResponse =
  | { ok: true; offer: PlaybackOffer; attempts: ResolveAttempt[] }
  | { ok: false; error: string; androidCode?: string; attempts?: ResolveAttempt[] };

let gateToken: string | null = null;

export function setGateToken(token: string | null): void {
  gateToken = token;
}

function gateHeaders(): Record<string, string> {
  return gateToken ? { 'X-Anilife-Gate': gateToken } : {};
}

function watchStorageKey(reference: string): string {
  return `anilife_watch_session_${reference}`;
}

export function watchSessionPath(session: WatchSession, activity = false): string {
  const prefix = activity ? '/activity' : '';
  return `${prefix}/watch/${session.reference}/episode-${session.episode}-${session.tag}`;
}

export function loadWatchSession(reference: string): WatchSession | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(watchStorageKey(reference)) ?? 'null') as Partial<WatchSession> | null;
    if (
      !parsed || parsed.reference !== reference || typeof parsed.tag !== 'string' ||
      typeof parsed.token !== 'string' || !Number.isSafeInteger(parsed.aniListId) ||
      !Number.isSafeInteger(parsed.episode) || !Number.isSafeInteger(parsed.expiresAt)
    ) return null;
    return parsed as WatchSession;
  } catch {
    return null;
  }
}

export function removeWatchSession(reference: string): void {
  try {
    sessionStorage.removeItem(watchStorageKey(reference));
  } catch {}
}

export async function createWatchSession(aniListId: number, episode: number): Promise<WatchSession | null> {
  try {
    const response = await fetch('/api/watch/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...gateHeaders() },
      body: JSON.stringify({ aniListId, episode }),
    });
    const data = (await response.json()) as Partial<WatchSession> & { ok?: boolean };
    if (!response.ok || data.ok !== true) return null;
    const session = data as WatchSession;
    sessionStorage.setItem(watchStorageKey(session.reference), JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

export async function validateWatchSession(session: WatchSession): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  aniListId?: number;
  episode?: number;
}> {
  try {
    const response = await fetch('/api/watch/session/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...gateHeaders() },
      body: JSON.stringify(session),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string; aniListId?: number; episode?: number };
    return { ...data, ok: response.ok && data.ok === true, status: response.status };
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
}

function toQuery(params: ResolveParams): string {
  const query = new URLSearchParams({
    aniListId: String(params.aniListId),
    episode: String(params.episode),
    audio: params.audio,
  });
  if (params.provider) query.set('provider', params.provider);
  if (params.malId) query.set('malId', String(params.malId));
  if (params.variant) query.set('variant', params.variant);
  if (params.lang) query.set('lang', params.lang);
  if (params.quality) query.set('quality', params.quality);
  if (params.fallback) query.set('fallback', '1');
  if (params.order && params.order.length > 0) query.set('order', params.order.join(','));
  if (params.enabled) query.set('enabled', params.enabled.join(','));
  return query.toString();
}

/**
 * Calls the Worker resolver. The provider is always named by id; no caller-supplied
 * destination ever reaches the server.
 */
export async function resolveEpisode(params: ResolveParams, signal?: AbortSignal): Promise<ResolveResponse> {
  try {
    const response = await fetch(`/api/resolve?${toQuery(params)}`, {
      signal,
      headers: {
        ...gateHeaders(),
        ...(params.watchSession ? {
          'X-Anilife-Watch': params.watchSession.token,
          'X-Anilife-Watch-Reference': params.watchSession.reference,
          'X-Anilife-Watch-Tag': params.watchSession.tag,
        } : {}),
      },
    });
    const data = (await response.json()) as ResolveResponse;
    if (!response.ok && data.ok !== false) {
      recordDiagnostic('SRC-05', { reason: `http_${response.status}` });
      return { ok: false, error: `http_${response.status}` };
    }
    if (data.ok === false) {
      recordDiagnostic(data.androidCode ?? 'SRC-05', { reason: data.error });
    }
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'aborted' };
    }
    recordDiagnostic('NET-03', { reason: 'resolve_network' });
    return { ok: false, error: 'network' };
  }
}

export async function getGateStatus(): Promise<boolean> {
  try {
    const response = await fetch('/api/gate/status', { headers: gateHeaders() });
    if (!response.ok) return false;
    const data = (await response.json()) as { passed?: boolean };
    return data.passed === true;
  } catch {
    return false;
  }
}

export async function verifyGateToken(token: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch('/api/gate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
