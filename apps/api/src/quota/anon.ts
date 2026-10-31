import { pricing } from "@acm/config/pricing";
import type { ApiEnv } from "../env";
import { anonFingerprint, utcDay } from "./fingerprint";

export type QuotaSnapshot = {
  fingerprint: string;
  day: string;
  limit: number;
  used: number;
  remaining: number;
};

type MemoryRow = { used: number };

/** Process-local fallback when D1 is not bound (local stub / single isolate). */
const memoryQuota = new Map<string, MemoryRow>();

function memoryKey(fingerprint: string, day: string): string {
  return `${day}:${fingerprint}`;
}

async function readUsed(env: ApiEnv, fingerprint: string, day: string): Promise<number> {
  if (env.DB) {
    const row = await env.DB.prepare(
      "SELECT used FROM ai_anon_quota WHERE fingerprint = ? AND day = ?",
    )
      .bind(fingerprint, day)
      .first<{ used: number }>();
    return row?.used ?? 0;
  }
  return memoryQuota.get(memoryKey(fingerprint, day))?.used ?? 0;
}

async function writeUsed(
  env: ApiEnv,
  fingerprint: string,
  day: string,
  used: number,
): Promise<void> {
  if (env.DB) {
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO ai_anon_quota (fingerprint, day, used, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(fingerprint, day) DO UPDATE SET used = excluded.used, updated_at = excluded.updated_at`,
    )
      .bind(fingerprint, day, used, updatedAt)
      .run();
    return;
  }
  memoryQuota.set(memoryKey(fingerprint, day), { used });
}

export async function getAnonQuota(
  env: ApiEnv,
  request: Request,
  limit: number = pricing.free.anonAiDemoPerDay,
): Promise<QuotaSnapshot> {
  const fingerprint = await anonFingerprint(request);
  const day = utcDay();
  const used = await readUsed(env, fingerprint, day);
  return {
    fingerprint,
    day,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

/**
 * Reserve one successful AI op. Returns null when exhausted.
 * Call only after provider success (or immediately before if you accept rare orphan reserves).
 */
export async function consumeAnonQuota(
  env: ApiEnv,
  request: Request,
  limit: number = pricing.free.anonAiDemoPerDay,
): Promise<QuotaSnapshot | null> {
  const fingerprint = await anonFingerprint(request);
  const day = utcDay();

  if (env.DB) {
    const updatedAt = new Date().toISOString();
    // Conditional insert/update keeps used <= limit under concurrent requests.
    await env.DB.prepare(
      `INSERT INTO ai_anon_quota (fingerprint, day, used, updated_at)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(fingerprint, day) DO NOTHING`,
    )
      .bind(fingerprint, day, updatedAt)
      .run();

    const result = await env.DB.prepare(
      `UPDATE ai_anon_quota
       SET used = used + 1, updated_at = ?
       WHERE fingerprint = ? AND day = ? AND used < ?
       RETURNING used`,
    )
      .bind(updatedAt, fingerprint, day, limit)
      .first<{ used: number }>();

    if (!result) {
      return null;
    }
    return {
      fingerprint,
      day,
      limit,
      used: result.used,
      remaining: Math.max(0, limit - result.used),
    };
  }

  const key = memoryKey(fingerprint, day);
  const current = memoryQuota.get(key)?.used ?? 0;
  if (current >= limit) return null;
  const used = current + 1;
  memoryQuota.set(key, { used });
  return {
    fingerprint,
    day,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

/** Test helper — clear in-memory store. */
export function __resetMemoryQuotaForTests(): void {
  memoryQuota.clear();
}
