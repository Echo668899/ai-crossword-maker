import { describe, expect, it } from "vitest";
import { pricing } from "@acm/config/pricing";

/** Pure entitlement → pack limits (mirrors resolvePackAccess branching). */
function limitsFrom(flags: { isPro: boolean; activityPack: boolean }) {
  if (flags.isPro) {
    return {
      canCreatePack: true,
      maxPacks: pricing.proMonthly.cloudProjects,
      maxVariants: Math.max(pricing.activityPack.layoutVariants, 5),
      canBatchExport: true,
    };
  }
  if (flags.activityPack) {
    return {
      canCreatePack: true,
      maxPacks: 1,
      maxVariants: pricing.activityPack.layoutVariants,
      canBatchExport: true,
    };
  }
  return { canCreatePack: false, maxPacks: 0, maxVariants: 0, canBatchExport: false };
}

describe("pack access limits", () => {
  it("blocks free users from multi-variant packs", () => {
    expect(limitsFrom({ isPro: false, activityPack: false }).canCreatePack).toBe(false);
  });

  it("allows one Activity Pack with three layout variants", () => {
    const lim = limitsFrom({ isPro: false, activityPack: true });
    expect(lim.canCreatePack).toBe(true);
    expect(lim.maxPacks).toBe(1);
    expect(lim.maxVariants).toBe(3);
  });

  it("gives Pro higher caps and batch export", () => {
    const lim = limitsFrom({ isPro: true, activityPack: false });
    expect(lim.maxVariants).toBeGreaterThanOrEqual(5);
    expect(lim.canBatchExport).toBe(true);
  });
});
