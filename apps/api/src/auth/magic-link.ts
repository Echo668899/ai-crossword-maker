import type { ApiEnv } from "../env";
import { clientIp, generateId, generateToken, hashIp, sha256Hex } from "./crypto";
import { consumeRateLimit } from "./rate-limit";
import { createSession, upsertUserByEmail } from "./session";
import { siteOrigin } from "../env";

const MAGIC_TTL_MS = 1000 * 60 * 20; // 20 minutes
const EMAIL_DAILY_LIMIT = 8;

function requireDb(env: ApiEnv): D1Database {
  if (!env.DB) throw new Error("DB_REQUIRED");
  return env.DB;
}

function normalizeEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) return null;
  return e;
}

export type MagicLinkCreateResult =
  | {
      ok: true;
      email: string;
      /** Only present when AUTH_DEV_RETURN_LINK=true — never enable in production. */
      devLink?: string;
    }
  | { ok: false; code: "invalid_email" | "rate_limited" | "db_required"; message: string };

export async function requestMagicLink(
  env: ApiEnv,
  request: Request,
  emailRaw: string,
): Promise<MagicLinkCreateResult> {
  if (!env.DB) {
    return {
      ok: false,
      code: "db_required",
      message: "Auth requires D1. Apply migrations and bind DB.",
    };
  }
  const email = normalizeEmail(emailRaw);
  if (!email) {
    return { ok: false, code: "invalid_email", message: "Enter a valid email address." };
  }

  const ip = clientIp(request);
  const emailLimit = await consumeRateLimit(env, `magic:email:${email}`, EMAIL_DAILY_LIMIT);
  const ipLimit = await consumeRateLimit(env, `magic:ip:${await hashIp(ip)}`, 20);
  if (!emailLimit.ok || !ipLimit.ok) {
    return {
      ok: false,
      code: "rate_limited",
      message: "Too many sign-in emails. Try again later.",
    };
  }

  const db = requireDb(env);
  const rawToken = generateToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const id = generateId(16);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_TTL_MS).toISOString();

  await db
    .prepare(
      `INSERT INTO magic_link_tokens
        (id, email, token_hash, expires_at, consumed_at, created_at, request_ip_hash)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(id, email, tokenHash, expiresAt, now.toISOString(), await hashIp(ip))
    .run();

  // Verify hits the API Worker; post-login redirect uses the web origin (AUTH_PUBLIC_ORIGIN).
  const apiOrigin = new URL(request.url).origin;
  const verifyUrl = new URL("/api/v1/auth/magic-link/verify", apiOrigin);
  verifyUrl.searchParams.set("token", rawToken);

  // No real mailer in this phase — log URL only when explicitly enabled; never log raw token alone in prod logs without flag.
  if (env.AUTH_DEV_LOG_LINKS === "true") {
    console.log(
      JSON.stringify({
        event: "auth_magic_link_created",
        emailDomain: email.split("@")[1] ?? "unknown",
        expiresAt,
      }),
    );
    console.log(`[auth-dev] magic link for ${email}: ${verifyUrl.toString()}`);
  }

  const result: MagicLinkCreateResult = { ok: true, email };
  if (env.AUTH_DEV_RETURN_LINK === "true") {
    return { ...result, devLink: verifyUrl.toString() };
  }
  return result;
}

export type MagicVerifyResult =
  | { ok: true; token: string; redirectTo: string }
  | { ok: false; code: string; message: string };

export async function verifyMagicLink(
  env: ApiEnv,
  request: Request,
  rawToken: string,
): Promise<MagicVerifyResult> {
  if (!env.DB) {
    return { ok: false, code: "db_required", message: "Auth requires D1." };
  }
  if (!rawToken || rawToken.length < 20) {
    return { ok: false, code: "invalid_token", message: "Invalid or expired sign-in link." };
  }

  const db = env.DB;
  const tokenHash = await sha256Hex(rawToken);
  const row = await db
    .prepare(
      `SELECT id, email, expires_at, consumed_at FROM magic_link_tokens WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{ id: string; email: string; expires_at: string; consumed_at: string | null }>();

  if (!row || row.consumed_at) {
    return { ok: false, code: "invalid_token", message: "Invalid or expired sign-in link." };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, code: "expired", message: "This sign-in link has expired." };
  }

  const now = new Date().toISOString();
  const consume = await db
    .prepare(
      `UPDATE magic_link_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
    )
    .bind(now, row.id)
    .run();
  if (!consume.meta.changes) {
    return { ok: false, code: "invalid_token", message: "This sign-in link was already used." };
  }

  const user = await upsertUserByEmail(env, row.email, { verified: true });
  const session = await createSession(env, user.id, request);
  const redirectTo = new URL("/app/", siteOrigin(env)).toString();
  return { ok: true, token: session.token, redirectTo };
}
