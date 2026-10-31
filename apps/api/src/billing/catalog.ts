import { pricing } from "@acm/config/pricing";
import type { CheckoutSku } from "./types";

export type SkuCatalogEntry = {
  sku: CheckoutSku;
  name: string;
  amountCents: number;
  currency: "usd";
  mode: "subscription" | "payment";
  /** Entitlements granted on successful payment / activation. */
  grants: Array<{
    kind: "pro_access" | "ai_credits" | "activity_pack" | "unwatermarked_export" | "batch_export";
    amount?: number;
  }>;
};

const CATALOG: Record<CheckoutSku, SkuCatalogEntry> = {
  pro_monthly: {
    sku: "pro_monthly",
    name: pricing.proMonthly.name,
    amountCents: Math.round(pricing.proMonthly.priceUsd * 100),
    currency: "usd",
    mode: "subscription",
    grants: [
      { kind: "pro_access" },
      { kind: "ai_credits", amount: pricing.proMonthly.aiOpsPerPeriod },
      { kind: "unwatermarked_export" },
      { kind: "batch_export" },
    ],
  },
  pro_yearly: {
    sku: "pro_yearly",
    name: pricing.proYearly.name,
    amountCents: Math.round(pricing.proYearly.priceUsd * 100),
    currency: "usd",
    mode: "subscription",
    grants: [
      { kind: "pro_access" },
      { kind: "ai_credits", amount: pricing.proYearly.aiOpsPerPeriod },
      { kind: "unwatermarked_export" },
      { kind: "batch_export" },
    ],
  },
  credits_50: {
    sku: "credits_50",
    name: pricing.creditPacks[0].name,
    amountCents: Math.round(pricing.creditPacks[0].priceUsd * 100),
    currency: "usd",
    mode: "payment",
    grants: [{ kind: "ai_credits", amount: pricing.creditPacks[0].aiOps }],
  },
  credits_100: {
    sku: "credits_100",
    name: pricing.creditPacks[1].name,
    amountCents: Math.round(pricing.creditPacks[1].priceUsd * 100),
    currency: "usd",
    mode: "payment",
    grants: [{ kind: "ai_credits", amount: pricing.creditPacks[1].aiOps }],
  },
  activity_pack: {
    sku: "activity_pack",
    name: pricing.activityPack.name,
    amountCents: Math.round(pricing.activityPack.priceUsd * 100),
    currency: "usd",
    mode: "payment",
    grants: [
      { kind: "activity_pack" },
      { kind: "ai_credits", amount: pricing.activityPack.bonusAiOps },
    ],
  },
};

export function getSkuCatalog(sku: CheckoutSku): SkuCatalogEntry {
  return CATALOG[sku];
}

export function planVersion(envPlan?: string): string {
  return envPlan?.trim() || pricing.planVersion;
}
