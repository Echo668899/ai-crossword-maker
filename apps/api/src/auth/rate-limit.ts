import type { ApiEnv } from "../env";
import { utcDay } from "../quota/fingerprint";

const memory = new Map<string, number>();

export async function consumeRateLimit(
  env: ApiEnv,
  bucket: string,
  limit: number,
): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const day = utcDay();
  const key = `${day}:${bucket}`;

  if (env.DB) {
    const row = await env.DB.prepare(
      `SELECT count FROM auth_rate_limits WHERE bucket = ? AND day = ?`,
    )
      .bind(bucket, day)
      .first<{ count: number }>();
    const used = row?.count ?? 0;
    if (used >= limit) {
      return { ok: false, remaining: 0, limit };
    }
    const next = used + 1;
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO auth_rate_limits (bucket, day, count, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(bucket, day) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at`,
    )
      .bind(bucket, day, next, now)
      .run();
    return { ok: true, remaining: Math.max(0, limit - next), limit };
  }

  const used = memory.get(key) ?? 0;
  if (used >= limit) return { ok: false, remaining: 0, limit };
  const next = used + 1;
  memory.set(key, next);
  return { ok: true, remaining: Math.max(0, limit - next), limit };
}
