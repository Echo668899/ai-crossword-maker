import type { ApiEnv } from "../env";

export const SESSION_COOKIE = "acm_session";
export const OAUTH_STATE_COOKIE = "acm_oauth_state";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function sessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

export function isSecureCookie(env: ApiEnv, request: Request): boolean {
  if (env.AUTH_COOKIE_SECURE === "true") return true;
  if (env.AUTH_COOKIE_SECURE === "false") return false;
  const url = new URL(request.url);
  return url.protocol === "https:";
}

export function serializeSessionCookie(
  token: string,
  env: ApiEnv,
  request: Request,
  maxAge = SESSION_TTL_SECONDS,
): string {
  const secure = isSecureCookie(env, request);
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(env: ApiEnv, request: Request): string {
  const secure = isSecureCookie(env, request);
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("=") || "");
  }
  return null;
}

export function serializeOauthStateCookie(
  state: string,
  env: ApiEnv,
  request: Request,
): string {
  const secure = isSecureCookie(env, request);
  const parts = [
    `${OAUTH_STATE_COOKIE}=${state}`,
    "Path=/",
    "Max-Age=600",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearOauthStateCookie(env: ApiEnv, request: Request): string {
  const secure = isSecureCookie(env, request);
  const parts = [`${OAUTH_STATE_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
