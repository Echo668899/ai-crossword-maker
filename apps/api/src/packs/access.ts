import { pricing } from "@acm/config/pricing";
import { getEntitlementsSummary, type EntitlementsSummary } from "../billing/entitlements";
import type { ApiEnv } from "../env";

export type PackAccess = {
  entitlements: EntitlementsSummary;
  canCreatePack: boolean;
  maxPacks: number;
  maxVariants: number;
  canBatchExport: boolean;
  reason?: string;
};

export async function resolvePackAccess(env: ApiEnv, userId: string): Promise<PackAccess> {
  const entitlements = await getEntitlementsSummary(env, userId);
  if (entitlements.isPro) {
    return {
      entitlements,
      canCreatePack: true,
      maxPacks: pricing.proMonthly.cloudProjects,
      maxVariants: Math.max(pricing.activityPack.layoutVariants, 5),
      canBatchExport: true,
    };
  }
  if (entitlements.activityPack) {
    return {
      entitlements,
      canCreatePack: true,
      maxPacks: 1,
      maxVariants: pricing.activityPack.layoutVariants,
      canBatchExport: true,
    };
  }
  return {
    entitlements,
    canCreatePack: false,
    maxPacks: 0,
    maxVariants: 0,
    canBatchExport: false,
    reason:
      "Activity packs require an Activity Pack purchase or Pro. Free plan can still print a single layout.",
  };
}

export async function resolveVersionHistoryLimit(
  env: ApiEnv,
  userId: string,
): Promise<{ maxVersions: number; entitlements: EntitlementsSummary }> {
  const entitlements = await getEntitlementsSummary(env, userId);
  if (entitlements.isPro) {
    return { maxVersions: 100, entitlements };
  }
  if (entitlements.activityPack) {
    return { maxVersions: 20, entitlements };
  }
  return { maxVersions: pricing.free.loggedInCloudProjects, entitlements };
}
