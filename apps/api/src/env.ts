export type ApiEnv = {
  AI_ENABLED?: string;
  AI_ANON_DEMO_ENABLED?: string;
  AI_MAX_RETRIES?: string;
  AI_DAILY_BUDGET?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL_GENERATE?: string;
  OPENAI_MODEL_REWRITE?: string;
  PUBLIC_SITE_URL?: string;
  PLAN_VERSION?: string;
  /** Optional D1 for durable anon quota. Falls back to in-memory when absent. */
  DB?: D1Database;
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
