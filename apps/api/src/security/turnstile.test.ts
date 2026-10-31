import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMemoryRateLimits, consumeRateLimit } from "./rate-limit";
import { verifyTurnstile } from "./turnstile";

afterEach(() => {
  vi.unstubAllGlobals();
  clearMemoryRateLimits();
});

describe("verifyTurnstile", () => {
  it("skips when secret is unset", async () => {
    const result = await verifyTurnstile({}, "any");
    expect(result).toEqual({ ok: true, skipped: true });
  });

  it("fails closed when required but secret missing", async () => {
    const result = await verifyTurnstile({ TURNSTILE_REQUIRED: "true" }, "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("turnstile_misconfigured");
  });

  it("requires a token when secret is configured", async () => {
    const result = await verifyTurnstile({ TURNSTILE_SECRET_KEY: "secret" }, "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("turnstile_required");
  });

  it("accepts a successful siteverify response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          action: "ai-topic",
          hostname: "localhost",
        }),
      ),
    );
    const result = await verifyTurnstile(
      {
        TURNSTILE_SECRET_KEY: "secret",
        TURNSTILE_HOSTNAMES: "localhost,127.0.0.1",
        TURNSTILE_ACTION: "ai-topic",
      },
      "token-ok",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toBe(false);
  });

  it("rejects hostname mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          action: "ai-topic",
          hostname: "evil.example",
        }),
      ),
    );
    const result = await verifyTurnstile(
      {
        TURNSTILE_SECRET_KEY: "secret",
        TURNSTILE_HOSTNAMES: "crosswordmaker.app",
      },
      "token-ok",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("turnstile_hostname");
  });
});

describe("consumeRateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    const a = await consumeRateLimit({}, "t1", 2, 60_000);
    const b = await consumeRateLimit({}, "t1", 2, 60_000);
    const c = await consumeRateLimit({}, "t1", 2, 60_000);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
  });
});
