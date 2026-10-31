import type { ApiEnv } from "../env";
import { clientIp, generateToken, hashIp, sha256Hex } from "./crypto";
import { readCookie, SESSION_COOKIE, sessionTtlSeconds } from "./cookies";

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  planVersion: string | null;
};

export type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
};

function requireDb(env: ApiEnv): D1Database {
  if (!env.DB) {
    throw new Error("DB_REQUIRED");
  }
  return env.DB;
}

export async function createSession(
  env: ApiEnv,
  userId: string,
  request: Request,
): Promise<{ token: string; expiresAt: string }> {
  const db = requireDb(env);
  const token = generateToken(32);
  const id = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlSeconds() * 1000).toISOString();
  const ip = await hashIp(clientIp(request));
  const ua = request.headers.get("user-agent")?.slice(0, 240) ?? null;
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, expiresAt, now.toISOString(), ua, ip)
    .run();
  return { token, expiresAt };
}

export async function validateSession(
  env: ApiEnv,
  request: Request,
): Promise<{ user: AuthUser; sessionId: string } | null> {
  if (!env.DB) return null;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id as session_id, s.expires_at, u.id as user_id, u.email, u.name,
            u.email_verified, u.plan_version
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
  )
    .bind(id)
    .first<{
      session_id: string;
      expires_at: string;
      user_id: string;
      email: string | null;
      name: string | null;
      email_verified: number | null;
      plan_version: string | null;
    }>();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }

  return {
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      emailVerified: Boolean(row.email_verified),
      planVersion: row.plan_version,
    },
  };
}

export async function invalidateSession(env: ApiEnv, sessionId: string): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

export async function invalidateAllUserSessions(env: ApiEnv, userId: string): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

export async function upsertUserByEmail(
  env: ApiEnv,
  email: string,
  opts?: { name?: string | null; verified?: boolean },
): Promise<AuthUser> {
  const db = requireDb(env);
  const normalized = email.trim().toLowerCase();
  const existing = await db
    .prepare(
      `SELECT id, email, name, email_verified, plan_version FROM users WHERE email = ?`,
    )
    .bind(normalized)
    .first<{
      id: string;
      email: string | null;
      name: string | null;
      email_verified: number | null;
      plan_version: string | null;
    }>();

  if (existing) {
    if (opts?.verified) {
      await db
        .prepare(`UPDATE users SET email_verified = 1, name = COALESCE(?, name) WHERE id = ?`)
        .bind(opts.name ?? null, existing.id)
        .run();
    }
    return {
      id: existing.id,
      email: existing.email,
      name: opts?.name ?? existing.name,
      emailVerified: opts?.verified ? true : Boolean(existing.email_verified),
      planVersion: existing.plan_version,
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, email_verified, created_at, plan_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      normalized,
      opts?.name ?? null,
      opts?.verified ? 1 : 0,
      now,
      env.PLAN_VERSION ?? null,
    )
    .run();

  return {
    id,
    email: normalized,
    name: opts?.name ?? null,
    emailVerified: Boolean(opts?.verified),
    planVersion: env.PLAN_VERSION ?? null,
  };
}
