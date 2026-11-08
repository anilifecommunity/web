const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 5000;

export interface RateResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Per-isolate sliding window. Cheap abuse control in front of resolver calls; not a substitute
 * for Cloudflare's edge rate limiting, which is configured separately at deploy time.
 */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}
