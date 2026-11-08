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
  return query.toString();
}

/**
 * Calls the Worker resolver. The provider is always named by id; no caller-supplied
 * destination ever reaches the server.
 */
export async function resolveEpisode(params: ResolveParams, signal?: AbortSignal): Promise<ResolveResponse> {
  try {
    const response = await fetch(`/api/resolve?${toQuery(params)}`, { signal });
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
    const response = await fetch('/api/gate/status');
    if (!response.ok) return true;
    const data = (await response.json()) as { passed?: boolean };
    return data.passed === true;
  } catch {
    return true;
  }
}

export async function verifyGateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/gate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}
