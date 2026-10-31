import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../env";
import {
  mailConfigured,
  mailFromAddress,
  mailProvider,
  sendMagicLinkEmail,
} from "./mailer";

function env(partial: Partial<ApiEnv> = {}): ApiEnv {
  return partial as ApiEnv;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mailer config", () => {
  it("defaults to none without key", () => {
    expect(mailProvider(env())).toBe("none");
    expect(mailConfigured(env())).toBe(false);
  });

  it("auto-selects resend when RESEND_API_KEY is set", () => {
    const e = env({ RESEND_API_KEY: "re_test", MAIL_FROM: "noreply@crosswordmaker.app" });
    expect(mailProvider(e)).toBe("resend");
    expect(mailConfigured(e)).toBe(true);
  });

  it("treats mailchannels as not wired", () => {
    expect(mailProvider(env({ MAIL_PROVIDER: "mailchannels", RESEND_API_KEY: "re_x" }))).toBe(
      "none",
    );
  });

  it("uses default from address", () => {
    expect(mailFromAddress(env())).toBe("noreply@crosswordmaker.app");
  });
});

describe("sendMagicLinkEmail", () => {
  it("returns not_configured when no provider", async () => {
    const result = await sendMagicLinkEmail(env(), {
      to: "user@example.com",
      verifyUrl: "https://crosswordmaker.app/api/v1/auth/magic-link/verify?token=abc",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
  });

  it("posts to Resend without leaking the API key in thrown errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMagicLinkEmail(
      env({
        RESEND_API_KEY: "re_secret_value",
        MAIL_FROM: "noreply@crosswordmaker.app",
        MAIL_FROM_NAME: "Crossword Maker",
      }),
      {
        to: "user@example.com",
        verifyUrl: "https://crosswordmaker.app/api/v1/auth/magic-link/verify?token=tok",
        expiresMinutes: 20,
      },
    );

    expect(result).toEqual({ ok: true, provider: "resend" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_secret_value");
    const body = JSON.parse(String(init.body)) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };
    expect(body.from).toBe("Crossword Maker <noreply@crosswordmaker.app>");
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toContain("sign-in");
    expect(body.text).toContain("token=tok");
  });

  it("maps non-2xx Resend responses to provider_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 403 })),
    );
    const result = await sendMagicLinkEmail(
      env({ RESEND_API_KEY: "re_x", MAIL_FROM: "noreply@crosswordmaker.app" }),
      { to: "a@b.co", verifyUrl: "https://example.com/v?token=x" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("provider_error");
  });
});
