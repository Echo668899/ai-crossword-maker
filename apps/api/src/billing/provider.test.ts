import { describe, expect, it } from "vitest";
import type { ApiEnv } from "../env";
import { billingPreference, getBillingStatus, resolvePaymentProvider } from "./provider";

function env(partial: Partial<ApiEnv> = {}): ApiEnv {
  return { ...partial };
}

const stripeReady: Partial<ApiEnv> = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_PRICE_PRO_MONTHLY: "price_m",
  STRIPE_PRICE_PRO_YEARLY: "price_y",
  STRIPE_PRICE_CREDITS_50: "price_50",
  STRIPE_PRICE_CREDITS_100: "price_100",
  STRIPE_PRICE_ACTIVITY_PACK: "price_ap",
};

const creemReady: Partial<ApiEnv> = {
  CREEM_API_KEY: "creem_test",
  CREEM_PRODUCT_PRO_MONTHLY: "prod_m",
  CREEM_PRODUCT_PRO_YEARLY: "prod_y",
  CREEM_PRODUCT_CREDITS_50: "prod_50",
  CREEM_PRODUCT_CREDITS_100: "prod_100",
  CREEM_PRODUCT_ACTIVITY_PACK: "prod_ap",
};

describe("getBillingStatus", () => {
  it("disables checkout when nothing configured", () => {
    const s = getBillingStatus(env());
    expect(s.checkoutEnabled).toBe(false);
    expect(s.activeProvider).toBeNull();
  });

  it("prefers Stripe in auto mode when both ready", () => {
    const s = getBillingStatus(env({ ...stripeReady, ...creemReady }));
    expect(s.activeProvider).toBe("stripe");
    expect(s.checkoutEnabled).toBe(true);
    expect(s.portalEnabled).toBe(true);
  });

  it("falls back to Creem when Stripe incomplete", () => {
    const s = getBillingStatus(env(creemReady));
    expect(s.activeProvider).toBe("creem");
    expect(s.portalEnabled).toBe(false);
  });

  it("honors BILLING_PROVIDER=creem even if Stripe ready", () => {
    const s = getBillingStatus(
      env({ ...stripeReady, ...creemReady, BILLING_PROVIDER: "creem" }),
    );
    expect(s.activeProvider).toBe("creem");
    expect(billingPreference(env({ BILLING_PROVIDER: "creem" }))).toBe("creem");
  });

  it("returns null provider when forced Stripe but unmapped prices", () => {
    const s = getBillingStatus(
      env({ BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test" }),
    );
    expect(s.checkoutEnabled).toBe(false);
    expect(resolvePaymentProvider(env({ BILLING_PROVIDER: "stripe" }))).toBeNull();
  });
});
