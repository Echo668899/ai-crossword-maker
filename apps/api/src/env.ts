export type ApiEnv = {
  AI_ENABLED?: string;
  AI_ANON_DEMO_ENABLED?: string;
  AI_MAX_RETRIES?: string;
  AI_DAILY_BUDGET?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL_GENERATE?: string;
  OPENAI_MODEL_REWRITE?: string;
  PUBLIC_SITE_URL?: string;
  /** Browser origin for auth redirects (local: http://127.0.0.1:4321). Falls back to PUBLIC_SITE_URL. */
  AUTH_PUBLIC_ORIGIN?: string;
  PLAN_VERSION?: string;
  /** Optional D1 for durable anon quota, auth sessions, shares. */
  DB?: D1Database;
  /** Session / cookie hardening */
  AUTH_COOKIE_SECURE?: string;
  AUTH_DEV_LOG_LINKS?: string;
  AUTH_DEV_RETURN_LINK?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export function isAiEnabled(env: ApiEnv): boolean {
  return env.AI_ENABLED === "true" && Boolean(env.OPENAI_API_KEY);
}

export function isAnonDemoEnabled(env: ApiEnv): boolean {
  return env.AI_ANON_DEMO_ENABLED !== "false";
}

export function generateModel(env: ApiEnv): string {
  return env.OPENAI_MODEL_GENERATE?.trim() || "gpt-4.1-mini";
}

export function maxRetries(env: ApiEnv): number {
  const n = Number(env.AI_MAX_RETRIES ?? "2");
  if (!Number.isFinite(n) || n < 0) return 2;
  return Math.min(Math.floor(n), 4);
}

export function siteOrigin(env: ApiEnv): string {
  const raw =
    env.AUTH_PUBLIC_ORIGIN?.trim() ||
    env.PUBLIC_SITE_URL?.trim() ||
    "https://aicrosswordmaker.com";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://aicrosswordmaker.com";
  }
}
