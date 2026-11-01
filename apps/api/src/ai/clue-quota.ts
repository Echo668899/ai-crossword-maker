import { pricing } from "@acm/config/pricing";
import type { ApiEnv } from "../env";
import { validateSession } from "../auth/session";
import { getEntitlementsSummary } from "../billing/entitlements";
import { consumeAnonQuota, getAnonQuota, type QuotaSnapshot } from "../quota/anon";

export type ClueQuotaPolicy =
  | {
      kind: "unlimited";
      isPro: boolean;
      day: string;
    }
  | {
      kind: "daily";
      isPro: false;
      snapshot: QuotaSnapshot;
    };

function utcDayNow(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Paid Pro subscribers get unlimited Generate clues.
 * Free / anonymous users share the free daily AI ops pool.
 */
export async function resolveClueQuotaPolicy(
  env: ApiEnv,
  request: Request,
): Promise<ClueQuotaPolicy> {
  const session = await validateSession(env, request);
  if (session) {
    const entitlements = await getEntitlementsSummary(env, session.user.id);
    if (entitlements.isPro) {
      return { kind: "unlimited", isPro: true, day: utcDayNow() };
    }
  }

  const snapshot = await getAnonQuota(env, request, pricing.free.aiOpsPerDay);
  return { kind: "daily", isPro: false, snapshot };
}

export async function consumeClueDailyQuota(
  env: ApiEnv,
  request: Request,
): Promise<QuotaSnapshot | null> {
  return consumeAnonQuota(env, request, pricing.free.aiOpsPerDay);
}

export function clueQuotaResponse(
  policy: ClueQuotaPolicy,
  after?: QuotaSnapshot | null,
): {
  unlimited: boolean;
  isPro: boolean;
  limit: number | null;
  remaining: number | null;
  day: string;
} {
  if (policy.kind === "unlimited") {
    return {
      unlimited: true,
      isPro: true,
      limit: null,
      remaining: null,
      day: policy.day,
    };
  }
  const snap = after ?? policy.snapshot;
  return {
    unlimited: false,
    isPro: false,
    limit: snap.limit,
    remaining: snap.remaining,
    day: snap.day,
  };
}
