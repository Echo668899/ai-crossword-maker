import { pricing } from "@acm/config/pricing";
import type { ApiEnv } from "../env";
import {
  createCreemProvider,
  creemConfigured,
  creemProductsMapped,
} from "./creem";
import {
  createStripeProvider,
  stripeConfigured,
  stripePricesMapped,
} from "./stripe";
import type { BillingProviderId, BillingStatus, PaymentProvider } from "./types";
import { CHECKOUT_SKUS } from "./types";

export type ProviderPreference = "auto" | "stripe" | "creem";

export function billingPreference(env: ApiEnv): ProviderPreference {
  const raw = (env.BILLING_PROVIDER ?? "auto").trim().toLowerCase();
  if (raw === "stripe" || raw === "creem") return raw;
  return "auto";
}

export function getBillingStatus(env: ApiEnv): BillingStatus {
  const stripeOk = stripeConfigured(env);
  const creemOk = creemConfigured(env);
  const stripeMapped = stripePricesMapped(env);
  const creemMapped = creemProductsMapped(env);
  const pref = billingPreference(env);

  let active: BillingProviderId | null = null;
  if (pref === "stripe") {
    active = stripeOk && stripeMapped ? "stripe" : null;
  } else if (pref === "creem") {
    active = creemOk && creemMapped ? "creem" : null;
  } else if (creemOk && creemMapped) {
    // auto: Creem primary when fully configured; Stripe remains available fallback.
    active = "creem";
  } else if (stripeOk && stripeMapped) {
    active = "stripe";
  }

  return {
    checkoutEnabled: active !== null,
    portalEnabled: active === "stripe" && stripeOk,
    activeProvider: active,
    providers: {
      stripe: { configured: stripeOk, pricesMapped: stripeMapped },
      creem: { configured: creemOk, productsMapped: creemMapped },
    },
    planVersion: env.PLAN_VERSION?.trim() || pricing.planVersion,
    skus: [...CHECKOUT_SKUS],
  };
}

export function resolvePaymentProvider(env: ApiEnv): PaymentProvider | null {
  const status = getBillingStatus(env);
  if (!status.activeProvider) return null;
  if (status.activeProvider === "stripe") return createStripeProvider(env);
  return createCreemProvider(env);
}

export function resolveWebhookProvider(
  env: ApiEnv,
  providerHint: BillingProviderId,
): PaymentProvider | null {
  if (providerHint === "stripe") {
    return stripeConfigured(env) ? createStripeProvider(env) : null;
  }
  return creemConfigured(env) ? createCreemProvider(env) : null;
}
