export type TurnstileEnv = {
  TURNSTILE_SECRET_KEY?: string;
  /** When "true", require a valid token even if secret is unset → fail closed only if secret present. */
  TURNSTILE_REQUIRED?: string;
  /** Comma-separated approved hostnames from siteverify (e.g. aicrosswordmaker.com,localhost). */
  TURNSTILE_HOSTNAMES?: string;
  /** Optional expected action string (default: ai-topic). */
  TURNSTILE_ACTION?: string;
};

export type TurnstileCheck =
  | { ok: true; skipped: boolean; hostname?: string }
  | { ok: false; code: string; message: string };

type SiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
  challenge_ts?: string;
};

/**
 * Cloudflare Turnstile server-side Siteverify.
 * - No secret configured → skip (dev default) unless TURNSTILE_REQUIRED=true (then fail).
 * - Secret configured → require non-empty token and success=true (+ hostname/action when set).
 */
export async function verifyTurnstile(
  env: TurnstileEnv,
  token: string | undefined | null,
  opts?: { ip?: string | null; action?: string },
): Promise<TurnstileCheck> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  const required = env.TURNSTILE_REQUIRED === "true";

  if (!secret) {
    if (required) {
      return {
        ok: false,
        code: "turnstile_misconfigured",
        message: "Bot check is required but TURNSTILE_SECRET_KEY is not configured.",
      };
    }
    return { ok: true, skipped: true };
  }

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return {
      ok: false,
      code: "turnstile_required",
      message: "Complete the bot check and try again.",
    };
  }

  const expectedHostnames = new Set(
    (env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
  const expectedAction = (opts?.action || env.TURNSTILE_ACTION || "ai-topic").trim();

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (opts?.ip) body.set("remoteip", opts.ip);

  let result: SiteverifyResponse;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    result = (await res.json()) as SiteverifyResponse;
  } catch {
    return {
      ok: false,
      code: "turnstile_upstream",
      message: "Bot check temporarily unavailable. Try again shortly.",
    };
  }

  if (!result.success) {
    return {
      ok: false,
      code: "turnstile_failed",
      message: "Bot check failed. Refresh and try again.",
    };
  }

  if (expectedHostnames.size > 0) {
    const host = (result.hostname ?? "").toLowerCase();
    if (!expectedHostnames.has(host)) {
      return {
        ok: false,
        code: "turnstile_hostname",
        message: "Bot check hostname mismatch.",
      };
    }
  }

  if (expectedAction && result.action && result.action !== expectedAction) {
    return {
      ok: false,
      code: "turnstile_action",
      message: "Bot check action mismatch.",
    };
  }

  return { ok: true, skipped: false, hostname: result.hostname };
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}
