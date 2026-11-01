import { describe, expect, it } from "vitest";
import { EMAIL_COOLDOWN_MS, requestMagicLink } from "./magic-link";
import type { ApiEnv } from "../env";

type BucketRow = { window_start: string; count: number };

function memoryDb(): D1Database {
  const tokens: Array<{ email: string; created_at: string }> = [];
  const daily = new Map<string, number>();
  const windows = new Map<string, BucketRow>();

  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO magic_link_tokens")) {
                tokens.push({
                  email: String(args[1]),
                  created_at: String(args[4]),
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO auth_rate_limits")) {
                const bucket = String(args[0]);
                const day = String(args[1]);
                const count = Number(args[2]);
                daily.set(`${day}:${bucket}`, count);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO rate_limit_buckets")) {
                const key = String(args[0]);
                windows.set(key, { window_start: String(args[1]), count: 1 });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE rate_limit_buckets SET count = count + 1")) {
                const key = String(args[1]);
                const windowStart = String(args[2]);
                const limit = Number(args[3]);
                const row = windows.get(key);
                if (row && row.window_start === windowStart && row.count < limit) {
                  row.count += 1;
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              return { meta: { changes: 0 } };
            },
            async first<T>() {
              if (sql.includes("FROM auth_rate_limits")) {
                const bucket = String(args[0]);
                const day = String(args[1]);
                const count = daily.get(`${day}:${bucket}`);
                return (count == null ? null : ({ count } as T));
              }
              if (sql.includes("FROM rate_limit_buckets")) {
                const key = String(args[0]);
                const row = windows.get(key);
                return (row ? ({ ...row } as T) : null);
              }
              return null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function envWithDb(): ApiEnv {
  return {
    DB: memoryDb(),
    PUBLIC_SITE_URL: "https://crosswordmaker.app",
  } as ApiEnv;
}

function req(ip = "203.0.113.10") {
  return new Request("https://crosswordmaker.app/api/v1/auth/magic-link", {
    method: "POST",
    headers: { "CF-Connecting-IP": ip },
  });
}

describe("requestMagicLink short cooldown", () => {
  it("allows the first send then rate-limits the same email within the cooldown window", async () => {
    const env = envWithDb();
    const first = await requestMagicLink(env, req(), "teacher@school.edu");
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.retryAfterSeconds).toBe(Math.ceil(EMAIL_COOLDOWN_MS / 1000));
    }

    const second = await requestMagicLink(env, req(), "teacher@school.edu");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("rate_limited");
      expect(second.retryAfterSeconds).toBeGreaterThan(0);
      expect(second.message).toMatch(/wait/i);
    }
  });

  it("rate-limits a burst of distinct emails from the same IP", async () => {
    const env = envWithDb();
    const ip = "198.51.100.7";
    for (let i = 0; i < 5; i++) {
      const result = await requestMagicLink(env, req(ip), `user${i}@school.edu`);
      expect(result.ok).toBe(true);
    }
    const blocked = await requestMagicLink(env, req(ip), "user5@school.edu");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("rate_limited");
      expect(blocked.message).toMatch(/network/i);
    }
  });
});
