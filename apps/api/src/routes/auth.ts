import { Hono } from "hono";
import type { ApiEnv } from "../env";
import {
  clearOauthStateCookie,
  clearSessionCookie,
  OAUTH_STATE_COOKIE,
  readCookie,
  serializeOauthStateCookie,
  serializeSessionCookie,
} from "../auth/cookies";
import { exchangeGoogleCode, googleAuthUrl, googleEnabled, newOauthState } from "../auth/google";
import { requestMagicLink, verifyMagicLink } from "../auth/magic-link";
import { invalidateSession, validateSession } from "../auth/session";
import { siteOrigin } from "../env";

export const authRoutes = new Hono<{ Bindings: ApiEnv }>();

authRoutes.get("/api/v1/auth/me", async (c) => {
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ authenticated: false, user: null, googleEnabled: googleEnabled(c.env) });
  }
  return c.json({
    authenticated: true,
    user: session.user,
    googleEnabled: googleEnabled(c.env),
  });
});

authRoutes.post("/api/v1/auth/magic-link", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const result = await requestMagicLink(c.env, c.req.raw, email);
  if (!result.ok) {
    const status =
      result.code === "rate_limited" ? 429 : result.code === "db_required" ? 503 : 400;
    const headers: Record<string, string> = {};
    if (result.code === "rate_limited" && result.retryAfterSeconds) {
      headers["Retry-After"] = String(result.retryAfterSeconds);
    }
    return c.json(
      {
        error: {
          code: result.code,
          message: result.message,
          ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
        },
      },
      status,
      headers,
    );
  }
  return c.json({
    ok: true,
    message: "If that email can receive mail, a sign-in link is on its way.",
    email: result.email,
    retryAfterSeconds: result.retryAfterSeconds,
    ...(result.devLink ? { devLink: result.devLink } : {}),
  });
});

authRoutes.get("/api/v1/auth/magic-link/verify", async (c) => {
  const token = c.req.query("token") ?? "";
  const result = await verifyMagicLink(c.env, c.req.raw, token);
  if (!result.ok) {
    const login = new URL("/login/", siteOrigin(c.env));
    login.searchParams.set("error", result.code);
    return c.redirect(login.toString(), 302);
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: result.redirectTo,
      "Set-Cookie": serializeSessionCookie(result.token, c.env, c.req.raw),
    },
  });
});

authRoutes.post("/api/v1/auth/logout", async (c) => {
  const session = await validateSession(c.env, c.req.raw);
  if (session) {
    await invalidateSession(c.env, session.sessionId);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Set-Cookie": clearSessionCookie(c.env, c.req.raw),
    },
  });
});

authRoutes.get("/api/v1/auth/google", async (c) => {
  if (!googleEnabled(c.env)) {
    return c.json(
      { error: { code: "google_disabled", message: "Google sign-in is not configured." } },
      503,
    );
  }
  const state = newOauthState();
  const url = googleAuthUrl(c.env, state, c.req.raw);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": serializeOauthStateCookie(state, c.env, c.req.raw),
    },
  });
});

authRoutes.get("/api/v1/auth/google/callback", async (c) => {
  const code = c.req.query("code") ?? "";
  const state = c.req.query("state") ?? "";
  const expected = readCookie(c.req.raw, OAUTH_STATE_COOKIE);
  const loginError = (codeName: string) => {
    const login = new URL("/login/", siteOrigin(c.env));
    login.searchParams.set("error", codeName);
    return new Response(null, {
      status: 302,
      headers: {
        Location: login.toString(),
        "Set-Cookie": clearOauthStateCookie(c.env, c.req.raw),
      },
    });
  };

  if (!code || !state || !expected || state !== expected) {
    return loginError("oauth_state");
  }

  const result = await exchangeGoogleCode(c.env, c.req.raw, code);
  if (!result.ok) {
    return loginError(result.code);
  }

  const headers = new Headers({
    Location: new URL("/app/", siteOrigin(c.env)).toString(),
  });
  headers.append("Set-Cookie", serializeSessionCookie(result.token, c.env, c.req.raw));
  headers.append("Set-Cookie", clearOauthStateCookie(c.env, c.req.raw));
  return new Response(null, { status: 302, headers });
});
