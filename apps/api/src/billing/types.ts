/** Shared billing types — provider-agnostic. */

export type BillingProviderId = "stripe" | "creem";

export type CheckoutSku =
  | "pro_monthly"
  | "pro_yearly"
  | "credits_50"
  | "credits_100"
  | "activity_pack";

export const CHECKOUT_SKUS: readonly CheckoutSku[] = [
  "pro_monthly",
  "pro_yearly",
  "credits_50",
  "credits_100",
  "activity_pack",
] as const;

export function isCheckoutSku(value: string): value is CheckoutSku {
  return (CHECKOUT_SKUS as readonly string[]).includes(value);
}

export type CreateCheckoutInput = {
  orderId: string;
  userId: string;
  email: string | null;
  sku: CheckoutSku;
  planVersion: string;
  successUrl: string;
  cancelUrl: string;
};

export type CreateCheckoutResult = {
  url: string;
  providerSessionId: string;
};

export type CreatePortalInput = {
  providerCustomerId: string;
  returnUrl: string;
};

export type NormalizedBillingEvent = {
  provider: BillingProviderId;
  providerEventId: string;
  rawType: string;
  kind:
    | "checkout_paid"
    | "subscription_updated"
    | "subscription_canceled"
    | "subscription_renewed"
    | "ignored";
  orderId?: string;
  sku?: CheckoutSku;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerPaymentId?: string;
  providerSessionId?: string;
  status?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
};

export type PaymentProvider = {
  id: BillingProviderId;
  createCheckout: (input: CreateCheckoutInput) => Promise<CreateCheckoutResult>;
  verifyAndParseWebhook: (
    request: Request,
    rawBody: string,
  ) => Promise<NormalizedBillingEvent>;
  createPortal?: (input: CreatePortalInput) => Promise<{ url: string }>;
};

export type BillingStatus = {
  checkoutEnabled: boolean;
  portalEnabled: boolean;
  activeProvider: BillingProviderId | null;
  providers: {
    stripe: { configured: boolean; pricesMapped: boolean };
    creem: { configured: boolean; productsMapped: boolean };
  };
  planVersion: string;
  skus: CheckoutSku[];
};
