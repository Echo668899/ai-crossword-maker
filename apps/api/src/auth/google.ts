import type { ApiEnv } from "../env";
import { generateToken } from "./crypto";
import { createSession, upsertUserByEmail } from "./session";
import { siteOrigin } from "../env";

export function googleEnabled(env: ApiEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleCallbackUri(env: ApiEnv, request?: Request): string {
  // Callback must hit the API Worker. Prefer the incoming request origin when present.
  const base = request ? new URL(request.url).origin : siteOrigin(env);
  return new URL("/api/v1/auth/google/callback", base).toString();
}

export function googleAuthUrl(env: ApiEnv, state: string, request?: Request): string {
  const redirectUri = googleCallbackUri(env, request);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function newOauthState(): string {
  return generateToken(24);
}

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  id?: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeGoogleCode(
  env: ApiEnv,
  request: Request,
  code: string,
): Promise<{ ok: true; token: string } | { ok: false; code: string; message: string }> {
  if (!env.DB) {
    return { ok: false, code: "db_required", message: "Auth requires D1." };
  }
  if (!googleEnabled(env)) {
    return { ok: false, code: "google_disabled", message: "Google sign-in is not configured." };
  }

  const redirectUri = googleCallbackUri(env, request);
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    return { ok: false, code: "oauth_token", message: "Google token exchange failed." };
  }

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profile = (await profileRes.json()) as GoogleUserInfo;
  if (!profileRes.ok || !profile.email || !profile.id) {
    return { ok: false, code: "oauth_profile", message: "Could not read Google profile." };
  }
  if (profile.verified_email === false) {
    return { ok: false, code: "email_unverified", message: "Google email is not verified." };
  }

  const user = await upsertUserByEmail(env, profile.email, {
    name: profile.name ?? null,
    verified: true,
  });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO oauth_accounts (provider, provider_user_id, user_id, created_at)
     VALUES ('google', ?, ?, ?)
     ON CONFLICT(provider, provider_user_id) DO UPDATE SET user_id = excluded.user_id`,
  )
    .bind(profile.id, user.id, now)
    .run();

  if (profile.name || profile.picture) {
    await env.DB.prepare(
      `UPDATE users SET name = COALESCE(?, name), image_url = COALESCE(?, image_url) WHERE id = ?`,
    )
      .bind(profile.name ?? null, profile.picture ?? null, user.id)
      .run();
  }

  const session = await createSession(env, user.id, request);
  return { ok: true, token: session.token };
}
