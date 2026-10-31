import type { ApiEnv } from "../env";
import type { AuthUser } from "../auth/session";

/** Comma-separated admin emails from Worker env. Empty → admin API/UI deny-all. */
export function adminEmails(env: ApiEnv): string[] {
  const raw = env.ADMIN_EMAILS?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(env: ApiEnv, user: AuthUser | null | undefined): boolean {
  if (!user?.email) return false;
  const allow = adminEmails(env);
  if (allow.length === 0) return false;
  return allow.includes(user.email.trim().toLowerCase());
}

export function adminConfigured(env: ApiEnv): boolean {
  return adminEmails(env).length > 0;
}
