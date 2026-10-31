export type RateLimitEnv = {
  DB?: D1Database;
};

type MemoryBucket = { windowStart: number; count: number };
const memory = new Map<string, MemoryBucket>();

/**
 * Fixed-window rate limit. Uses D1 when bound, else in-memory (dev/single isolate).
 * Returns remaining allowance after a successful consume, or null when blocked.
 */
export async function consumeRateLimit(
  env: RateLimitEnv,
  bucketKey: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: true; remaining: number; resetAt: string } | { allowed: false; remaining: 0; resetAt: string }> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStartIso = new Date(windowStartMs).toISOString();
  const resetAt = new Date(windowStartMs + windowMs).toISOString();

  if (!env.DB) {
    const key = `${bucketKey}:${windowStartMs}`;
    const cur = memory.get(key) ?? { windowStart: windowStartMs, count: 0 };
    if (cur.count >= limit) {
      return { allowed: false, remaining: 0, resetAt };
    }
    cur.count += 1;
    memory.set(key, cur);
    // prune old windows opportunistically
    if (memory.size > 500) {
      for (const [k, v] of memory) {
        if (v.windowStart < now - windowMs * 2) memory.delete(k);
      }
    }
    return { allowed: true, remaining: Math.max(0, limit - cur.count), resetAt };
  }

  const row = await env.DB.prepare(
    `SELECT window_start, count FROM rate_limit_buckets WHERE bucket_key = ?`,
  )
    .bind(bucketKey)
    .first<{ window_start: string; count: number }>();

  if (!row || row.window_start !== windowStartIso) {
    await env.DB.prepare(
      `INSERT INTO rate_limit_buckets (bucket_key, window_start, count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET window_start = excluded.window_start, count = 1, updated_at = excluded.updated_at`,
    )
      .bind(bucketKey, windowStartIso, new Date().toISOString())
      .run();
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (row.count >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  await env.DB.prepare(
    `UPDATE rate_limit_buckets SET count = count + 1, updated_at = ? WHERE bucket_key = ? AND window_start = ? AND count < ?`,
  )
    .bind(new Date().toISOString(), bucketKey, windowStartIso, limit)
    .run();

  const after = await env.DB.prepare(
    `SELECT count FROM rate_limit_buckets WHERE bucket_key = ?`,
  )
    .bind(bucketKey)
    .first<{ count: number }>();

  const count = after?.count ?? row.count + 1;
  if (count > limit) {
    return { allowed: false, remaining: 0, resetAt };
  }
  return { allowed: true, remaining: Math.max(0, limit - count), resetAt };
}

/** Test helper */
export function clearMemoryRateLimits() {
  memory.clear();
}
