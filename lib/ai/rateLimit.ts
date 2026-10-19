/**
 * Simple in-memory per-user rate limit for AI Assisten.
 * Resets on server restart — enough for Fase 1 cost protection on a single instance.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export const AI_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const AI_RATE_LIMIT_MAX = 20;

export function checkAiRateLimit(
  userId: string,
  now = Date.now(),
  windowMs = AI_RATE_LIMIT_WINDOW_MS,
  max = AI_RATE_LIMIT_MAX
): { ok: true } | { ok: false; retryAfterSec: number } {
  const bucket = buckets.get(userId) ?? { timestamps: [] };
  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(userId, bucket);
    return { ok: false, retryAfterSec };
  }

  bucket.timestamps.push(now);
  buckets.set(userId, bucket);
  return { ok: true };
}

/** Test helper — clear all buckets. */
export function resetAiRateLimitForTests() {
  buckets.clear();
}
