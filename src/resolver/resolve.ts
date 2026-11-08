import { androidCodeFor, ResolverError } from './errors';
import { planAttempts } from './policy';
import { parsePlaybackOffer } from './validate';
import type {
  AttemptResult,
  PlaybackOffer,
  ProviderAdapter,
  ResolveRequest,
  ResolveResult,
  SelectionPolicy,
} from './types';

export interface ResolveOptions {
  request: ResolveRequest;
  policy: SelectionPolicy;
  adapters: Record<string, ProviderAdapter>;
  /** Per-provider budget. Bounds a slow upstream so one server cannot stall the picker. */
  timeoutMs?: number;
}

function failure(reason: string, attempts: AttemptResult[]): ResolveResult {
  return { ok: false, reason, androidCode: androidCodeFor(reason), attempts };
}

/**
 * Resolves the first usable offer in the planned order.
 *
 * Invariants:
 * - the request's audio and variant are passed through unchanged;
 * - a returned offer must name the same provider, media and episode;
 * - a stream whose audio contradicts the request is rejected, never silently played;
 * - on failure the caller receives a reason, not a different provider's stream.
 */
export async function resolvePlayback(options: ResolveOptions): Promise<ResolveResult> {
  const { request, policy, adapters } = options;
  const timeoutMs = options.timeoutMs ?? 12_000;

  const plan = planAttempts(policy);
  if (!plan.ok) return failure(plan.reason ?? 'unknown', []);
  if (plan.order.length === 0) return failure('no_streams', []);

  const attempts: AttemptResult[] = [];
  let lastReason = 'no_streams';

  for (const providerId of plan.order) {
    const adapter = adapters[providerId];
    if (!adapter) {
      const reason = 'provider_unavailable';
      attempts.push({ providerId, ok: false, reason, androidCode: androidCodeFor(reason) });
      lastReason = reason;
      if (!policy.allowFallback) return failure(reason, attempts);
      continue;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const budget = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ResolverError('timeout'));
        }, timeoutMs);
      });

      const raw = await Promise.race([
        adapter(request, { signal: controller.signal, timeoutMs }),
        budget,
      ]);

      const offer = parsePlaybackOffer(raw);
      if (!offer) throw new ResolverError('invalid_response');
      if (offer.providerId !== providerId) throw new ResolverError('invalid_response');
      if (offer.aniListId !== request.aniListId) throw new ResolverError('invalid_response');
      if (offer.episodeRef !== request.episodeRef) throw new ResolverError('invalid_response');
      if (offer.browserSupport === 'unsupported') throw new ResolverError('browser_codec');
      if (!offer.embed && !audioMatches(request, offer)) throw new ResolverError('audio_unavailable');

      attempts.push({ providerId, ok: true });
      return { ok: true, offer, attempts };
    } catch (error) {
      const reason = error instanceof ResolverError ? error.reason : 'provider_unavailable';
      attempts.push({
        providerId,
        ok: false,
        reason,
        androidCode: androidCodeFor(reason),
      });
      lastReason = reason;
      if (!policy.allowFallback) return failure(reason, attempts);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return failure(lastReason, attempts);
}

function audioMatches(request: ResolveRequest, offer: PlaybackOffer): boolean {
  if (request.audio === 'unknown' || request.audio === 'multi') return true;
  return offer.streams.some(
    (stream) => stream.audio === request.audio || stream.audio === 'multi'
  );
}
