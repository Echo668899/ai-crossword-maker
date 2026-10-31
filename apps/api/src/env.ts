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
  /** Optional D1 for durable anon quota, auth sessions, shares, billing ledger. */
  DB?: D1Database;
  /** Private pack export ZIPs — never public. */
  FILES?: R2Bucket;
  /** Async job producer (pack ZIP, future AI jobs). */
  JOBS?: Queue<{ jobId: string; type?: string }>;
  /** Session / cookie hardening */
  AUTH_COOKIE_SECURE?: string;
  AUTH_DEV_LOG_LINKS?: string;
  AUTH_DEV_RETURN_LINK?: string;
  /** Magic-link mail: `resend` | `none` (default auto: resend when RESEND_API_KEY set). */
  MAIL_PROVIDER?: string;
  /** Verified sender, e.g. noreply@crosswordmaker.app (non-secret var). */
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
  /** Resend API key (Worker secret). */
  RESEND_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Turnstile Siteverify secret (Worker secret). */
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_REQUIRED?: string;
  TURNSTILE_HOSTNAMES?: string;
  TURNSTILE_ACTION?: string;
  /** Billing: `auto` (Creem if ready else Stripe), `stripe`, or `creem`. */
  BILLING_PROVIDER?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_YEARLY?: string;
  STRIPE_PRICE_CREDITS_50?: string;
  STRIPE_PRICE_CREDITS_100?: string;
  STRIPE_PRICE_ACTIVITY_PACK?: string;
  CREEM_API_KEY?: string;
  CREEM_WEBHOOK_SECRET?: string;
  /** Default test: https://test-api.creem.io — live: https://api.creem.io */
  CREEM_API_BASE?: string;
  CREEM_PRODUCT_PRO_MONTHLY?: string;
  CREEM_PRODUCT_PRO_YEARLY?: string;
  CREEM_PRODUCT_CREDITS_50?: string;
  CREEM_PRODUCT_CREDITS_100?: string;
  CREEM_PRODUCT_ACTIVITY_PACK?: string;
  /** Comma-separated admin emails for /admin + /api/v1/admin/*. Empty denies all. */
  ADMIN_EMAILS?: string;
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
    "https://crosswordmaker.app";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://crosswordmaker.app";
  }
}
