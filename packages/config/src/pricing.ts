/** Experimental Hybrid pricing — plan_version must be stored with entitlements. */
export const PLAN_VERSION = "2026-10-31.hybrid.v1";

export const pricing = {
  planVersion: PLAN_VERSION,
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    anonAiDemoPerDay: 3,
    loggedInCloudProjects: 3,
    aiOpsPerDay: 3,
    watermarkExports: true,
    batchExport: false,
  },
  creditPacks: [
    {
      id: "credits_50",
      name: "Credit Pack 50",
      priceUsd: 5,
      aiOps: 50,
      includesUnwatermarkedExport: false,
    },
    {
      id: "credits_100",
      name: "Credit Pack 100",
      priceUsd: 8,
      aiOps: 100,
      includesUnwatermarkedExport: false,
    },
  ],
  activityPack: {
    id: "activity_pack",
    name: "Activity Pack",
    priceUsd: 4.99,
    layoutVariants: 3,
    bonusAiOps: 5,
    bindsToSingleProject: true,
  },
  proMonthly: {
    id: "pro_monthly",
    name: "Pro Monthly",
    priceUsd: 9,
    interval: "month" as const,
    aiOpsPerPeriod: 150,
    cloudProjects: 100,
    watermarkExports: false,
    batchExport: true,
    versionHistory: true,
  },
  proYearly: {
    id: "pro_yearly",
    name: "Pro Yearly",
    priceUsd: 72,
    interval: "year" as const,
    aiOpsPerPeriod: 150,
    cloudProjects: 100,
    watermarkExports: false,
    batchExport: true,
    versionHistory: true,
  },
} as const;

export type PricingConfig = typeof pricing;
