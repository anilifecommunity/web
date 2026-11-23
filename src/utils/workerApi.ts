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
  hideAdult?: boolean;
  watchSession?: WatchSession;
}

export interface WatchSession {
  reference: string;
  tag: string;
  aniListId: number;
  episode: number;
  expiresAt: number;
}

export class WatchSessionError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
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

function watchAnimeStorageKey(aniListId: number): string {
  return `anilife_watch_anime_${aniListId}`;
}

function parseWatchSession(raw: string | null): WatchSession | null {
  try {
    const parsed = JSON.parse(raw ?? 'null') as Partial<WatchSession> | null;
    if (
      !parsed || typeof parsed.reference !== 'string' || typeof parsed.tag !== 'string' ||
      !Number.isSafeInteger(parsed.aniListId) ||
      !Number.isSafeInteger(parsed.episode) || !Number.isSafeInteger(parsed.expiresAt)
    ) return null;
    return parsed as WatchSession;
  } catch {
    return null;
  }
}

function readWatchSession(key: string): WatchSession | null {
  try {
    const durable = typeof localStorage === 'undefined' ? null : parseWatchSession(localStorage.getItem(key));
    if (durable) return durable;
    const legacy = typeof sessionStorage === 'undefined' ? null : parseWatchSession(sessionStorage.getItem(key));
    if (legacy && typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(legacy));
    return legacy;
  } catch {
    return null;
  }
}

function persistWatchSession(session: WatchSession): void {
  const value = JSON.stringify(session);
  for (const storage of [
    typeof localStorage === 'undefined' ? null : localStorage,
    typeof sessionStorage === 'undefined' ? null : sessionStorage,
  ]) {
    try {
      storage?.setItem(watchStorageKey(session.reference), value);
      storage?.setItem(watchAnimeStorageKey(session.aniListId), value);
    } catch {}
  }
}

export function watchSessionPath(session: WatchSession, activity = false): string {
  const prefix = activity ? '/activity' : '';
  return `${prefix}/watch/${session.reference}/episode-${session.episode}-${session.tag}`;
}

export function loadWatchSession(reference: string, episode?: number): WatchSession | null {
  const session = readWatchSession(watchStorageKey(reference));
  if (!session || session.reference !== reference) return null;
  return episode === undefined ? session : { ...session, episode };
}

export function removeWatchSession(reference: string): void {
  const session = loadWatchSession(reference);
  for (const storage of [
    typeof localStorage === 'undefined' ? null : localStorage,
    typeof sessionStorage === 'undefined' ? null : sessionStorage,
  ]) {
    try {
      storage?.removeItem(watchStorageKey(reference));
      if (session) storage?.removeItem(watchAnimeStorageKey(session.aniListId));
    } catch {}
  }
}

export async function createWatchSession(aniListId: number, episode: number): Promise<WatchSession> {
  const stored = readWatchSession(watchAnimeStorageKey(aniListId));
  if (stored && stored.aniListId === aniListId && stored.expiresAt > Math.floor(Date.now() / 1000)) {
    const session = { ...stored, episode };
    const validation = await validateWatchSession(session);
    if (validation.ok) {
      persistWatchSession(session);
      return session;
    }
    if (validation.status === 401 || validation.status === 409 || validation.status === 429) {
      throw new WatchSessionError(validation.status, validation.error ?? 'watch_session_unavailable');
    }
    removeWatchSession(stored.reference);
  } else if (stored) {
    removeWatchSession(stored.reference);
  }

  try {
    const response = await fetch('/api/watch/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...gateHeaders() },
      body: JSON.stringify({ aniListId, episode }),
    });
    const data = (await response.json()) as Partial<WatchSession> & { ok?: boolean; error?: string };
    if (!response.ok || data.ok !== true) {
      throw new WatchSessionError(response.status, data.error ?? `http_${response.status}`);
    }
    const session = data as WatchSession;
    if (!parseWatchSession(JSON.stringify(session))) throw new WatchSessionError(502, 'invalid_watch_session');
    persistWatchSession(session);
    return session;
  } catch (error) {
    if (error instanceof WatchSessionError) throw error;
    throw new WatchSessionError(0, 'network');
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
  if (params.hideAdult !== undefined) query.set('hideAdult', params.hideAdult ? '1' : '0');
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
