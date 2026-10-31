import type { ApiEnv } from "../env";

/** Supported production providers. Mailchannels is documented for ops but not wired. */
export type MailProviderName = "resend" | "none";

export function mailFromAddress(env: ApiEnv): string {
  return env.MAIL_FROM?.trim() || "noreply@crosswordmaker.app";
}

export function mailFromName(env: ApiEnv): string {
  return env.MAIL_FROM_NAME?.trim() || "Crossword Maker";
}

/**
 * Resolve active mail provider.
 * - Explicit `MAIL_PROVIDER=resend` or a present `RESEND_API_KEY` → resend
 * - `MAIL_PROVIDER=mailchannels` → none (not implemented; see docs/email-setup)
 * - Otherwise → none (local uses AUTH_DEV_RETURN_LINK)
 */
export function mailProvider(env: ApiEnv): MailProviderName {
  const raw = env.MAIL_PROVIDER?.trim().toLowerCase() ?? "";
  if (raw === "mailchannels") return "none";
  if (raw === "resend") return "resend";
  if (raw === "none" || raw === "off" || raw === "disabled") return "none";
  if (env.RESEND_API_KEY?.trim()) return "resend";
  return "none";
}

/** True when production send path can run (key + from address). */
export function mailConfigured(env: ApiEnv): boolean {
  if (mailProvider(env) !== "resend") return false;
  return Boolean(env.RESEND_API_KEY?.trim() && mailFromAddress(env));
}

export type SendMagicLinkInput = {
  to: string;
  verifyUrl: string;
  /** Minutes until the link expires (for copy only). */
  expiresMinutes?: number;
};

export type SendMailResult =
  | { ok: true; provider: "resend" }
  | { ok: false; code: "not_configured" | "provider_error" | "unsupported_provider"; message: string };

function buildBodies(verifyUrl: string, expiresMinutes: number): { text: string; html: string } {
  const text = [
    "Sign in to Crossword Maker",
    "",
    `Use this one-time link (expires in about ${expiresMinutes} minutes):`,
    verifyUrl,
    "",
    "If you did not request this email, you can ignore it.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p><strong>Sign in to Crossword Maker</strong></p>
  <p>Use this one-time link (expires in about ${expiresMinutes} minutes):</p>
  <p><a href="${verifyUrl}">Sign in</a></p>
  <p style="color:#555;font-size:14px">If you did not request this email, you can ignore it.</p>
</body>
</html>`;

  return { text, html };
}

async function sendViaResend(
  env: ApiEnv,
  input: SendMagicLinkInput,
): Promise<SendMailResult> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, code: "not_configured", message: "RESEND_API_KEY is not set." };
  }

  const expiresMinutes = input.expiresMinutes ?? 20;
  const { text, html } = buildBodies(input.verifyUrl, expiresMinutes);
  const from = `${mailFromName(env)} <${mailFromAddress(env)}>`;

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: "Your Crossword Maker sign-in link",
        text,
        html,
      }),
    });
  } catch {
    return { ok: false, code: "provider_error", message: "Resend request failed." };
  }

  if (!res.ok) {
    // Never log API key, raw link, or full provider body (may echo recipient).
    console.log(
      JSON.stringify({
        event: "auth_mail_send_failed",
        provider: "resend",
        status: res.status,
      }),
    );
    return { ok: false, code: "provider_error", message: "Resend rejected the send." };
  }

  return { ok: true, provider: "resend" };
}

/** Send a magic-link email when a production provider is configured. */
export async function sendMagicLinkEmail(
  env: ApiEnv,
  input: SendMagicLinkInput,
): Promise<SendMailResult> {
  const provider = mailProvider(env);
  if (provider === "none") {
    return {
      ok: false,
      code: "not_configured",
      message: "No production mailer configured (set RESEND_API_KEY + MAIL_FROM).",
    };
  }
  if (provider === "resend") {
    return sendViaResend(env, input);
  }
  return {
    ok: false,
    code: "unsupported_provider",
    message: `Mail provider "${provider}" is not supported.`,
  };
}
