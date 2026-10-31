import { describe, expect, it, beforeEach } from "vitest";
import { __resetMemoryQuotaForTests, consumeAnonQuota, getAnonQuota } from "./anon";
import type { ApiEnv } from "../env";

function req(ip = "1.2.3.4"): Request {
  return new Request("https://example.test/api/v1/ai/topic", {
    headers: {
      "cf-connecting-ip": ip,
      "user-agent": "vitest",
    },
  });
}

describe("anon quota memory fallback", () => {
  const env: ApiEnv = {};

  beforeEach(() => {
    __resetMemoryQuotaForTests();
  });

  it("tracks remaining uses", async () => {
    const first = await getAnonQuota(env, req(), 2);
    expect(first.remaining).toBe(2);

    const a = await consumeAnonQuota(env, req(), 2);
    expect(a?.remaining).toBe(1);
    const b = await consumeAnonQuota(env, req(), 2);
    expect(b?.remaining).toBe(0);
    const c = await consumeAnonQuota(env, req(), 2);
    expect(c).toBeNull();
  });

  it("isolates fingerprints by IP", async () => {
    await consumeAnonQuota(env, req("10.0.0.1"), 1);
    const other = await getAnonQuota(env, req("10.0.0.2"), 1);
    expect(other.remaining).toBe(1);
  });
});
