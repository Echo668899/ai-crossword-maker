import { pricing } from "@acm/config/pricing";
import type { ApiEnv } from "../env";

export type EntitlementsSummary = {
  planVersion: string;
  isPro: boolean;
  aiCreditsRemaining: number;
  unwatermarkedExport: boolean;
  batchExport: boolean;
  activityPack: boolean;
  subscription: {
    sku: string;
    status: string;
    provider: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  free: {
    anonAiDemoPerDay: number;
    loggedInCloudProjects: number;
    aiOpsPerDay: number;
  };
};

export async function getEntitlementsSummary(
  env: ApiEnv,
  userId: string,
): Promise<EntitlementsSummary> {
  const base: EntitlementsSummary = {
    planVersion: env.PLAN_VERSION?.trim() || pricing.planVersion,
    isPro: false,
    aiCreditsRemaining: 0,
    unwatermarkedExport: false,
    batchExport: false,
    activityPack: false,
    subscription: null,
    free: {
      anonAiDemoPerDay: pricing.free.anonAiDemoPerDay,
      loggedInCloudProjects: pricing.free.loggedInCloudProjects,
      aiOpsPerDay: pricing.free.aiOpsPerDay,
    },
  };

  if (!env.DB) return base;

  const now = Date.now();
  const grants = await env.DB.prepare(
    `SELECT kind, remaining, ends_at FROM entitlement_grants WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ kind: string; remaining: number | null; ends_at: string | null }>();

  for (const g of grants.results ?? []) {
    if (g.ends_at && new Date(g.ends_at).getTime() < now) continue;
    if (g.kind === "ai_credits") {
      base.aiCreditsRemaining += Math.max(0, g.remaining ?? 0);
    } else if (g.kind === "pro_access") {
      base.isPro = true;
    } else if (g.kind === "unwatermarked_export") {
      base.unwatermarkedExport = true;
    } else if (g.kind === "batch_export") {
      base.batchExport = true;
    } else if (g.kind === "activity_pack") {
      base.activityPack = true;
    }
  }

  const sub = await env.DB.prepare(
    `SELECT sku, status, provider, current_period_end, cancel_at_period_end
     FROM subscriptions
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(userId)
    .first<{
      sku: string;
      status: string;
      provider: string;
      current_period_end: string | null;
      cancel_at_period_end: number;
    }>();

  if (sub) {
    base.subscription = {
      sku: sub.sku,
      status: sub.status,
      provider: sub.provider,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    };
    if (sub.status === "active" || sub.status === "trialing") {
      base.isPro = true;
      base.unwatermarkedExport = true;
      base.batchExport = true;
    }
  }

  return base;
}
