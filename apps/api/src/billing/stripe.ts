import type { ApiEnv } from "../env";
import { getSkuCatalog } from "./catalog";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  CreatePortalInput,
  NormalizedBillingEvent,
  PaymentProvider,
} from "./types";
import { isCheckoutSku } from "./types";

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured(env: ApiEnv): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

export function stripePricesMapped(env: ApiEnv): boolean {
  return Boolean(
    env.STRIPE_PRICE_PRO_MONTHLY?.trim() &&
      env.STRIPE_PRICE_PRO_YEARLY?.trim() &&
      env.STRIPE_PRICE_CREDITS_50?.trim() &&
      env.STRIPE_PRICE_CREDITS_100?.trim() &&
      env.STRIPE_PRICE_ACTIVITY_PACK?.trim(),
  );
}

function stripePriceId(env: ApiEnv, sku: CreateCheckoutInput["sku"]): string | null {
  const map: Record<CreateCheckoutInput["sku"], string | undefined> = {
    pro_monthly: env.STRIPE_PRICE_PRO_MONTHLY,
    pro_yearly: env.STRIPE_PRICE_PRO_YEARLY,
    credits_50: env.STRIPE_PRICE_CREDITS_50,
    credits_100: env.STRIPE_PRICE_CREDITS_100,
    activity_pack: env.STRIPE_PRICE_ACTIVITY_PACK,
  };
  const id = map[sku]?.trim();
  return id || null;
}

async function stripeForm(
  env: ApiEnv,
  path: string,
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message || `Stripe API ${res.status}`);
  }
  return json;
}

/** Stripe webhook signature: t=timestamp,v1=hmac_sha256(secret, `${t}.${body}`). */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSec) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${t}.${rawBody}`),
  );
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(expected, v1);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function metaString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function normalizeStripeEvent(payload: Record<string, unknown>): NormalizedBillingEvent {
  const id = typeof payload.id === "string" ? payload.id : "";
  const rawType = typeof payload.type === "string" ? payload.type : "";
  const data = payload.data as { object?: Record<string, unknown> } | undefined;
  const obj = data?.object ?? {};

  const metadata = obj.metadata;
  const orderId = metaString(metadata, "order_id") ?? metaString(metadata, "orderId");
  const skuRaw = metaString(metadata, "sku");
  const sku = skuRaw && isCheckoutSku(skuRaw) ? skuRaw : undefined;

  if (rawType === "checkout.session.completed") {
    return {
      provider: "stripe",
      providerEventId: id,
      rawType,
      kind: "checkout_paid",
      orderId,
      sku,
      providerCustomerId:
        typeof obj.customer === "string" ? obj.customer : undefined,
      providerSubscriptionId:
        typeof obj.subscription === "string" ? obj.subscription : undefined,
      providerPaymentId:
        typeof obj.payment_intent === "string" ? obj.payment_intent : undefined,
      providerSessionId: typeof obj.id === "string" ? obj.id : undefined,
      status: typeof obj.status === "string" ? obj.status : "complete",
    };
  }

  if (
    rawType === "customer.subscription.updated" ||
    rawType === "customer.subscription.created"
  ) {
    const periodStart =
      typeof obj.current_period_start === "number"
        ? new Date(obj.current_period_start * 1000).toISOString()
        : undefined;
    const periodEnd =
      typeof obj.current_period_end === "number"
        ? new Date(obj.current_period_end * 1000).toISOString()
        : undefined;
    return {
      provider: "stripe",
      providerEventId: id,
      rawType,
      kind: "subscription_updated",
      orderId,
      sku,
      providerCustomerId:
        typeof obj.customer === "string" ? obj.customer : undefined,
      providerSubscriptionId: typeof obj.id === "string" ? obj.id : undefined,
      status: typeof obj.status === "string" ? obj.status : undefined,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
    };
  }

  if (rawType === "customer.subscription.deleted") {
    return {
      provider: "stripe",
      providerEventId: id,
      rawType,
      kind: "subscription_canceled",
      orderId,
      sku,
      providerCustomerId:
        typeof obj.customer === "string" ? obj.customer : undefined,
      providerSubscriptionId: typeof obj.id === "string" ? obj.id : undefined,
      status: "canceled",
    };
  }

  if (rawType === "invoice.paid") {
    const sub =
      typeof obj.subscription === "string" ? obj.subscription : undefined;
    return {
      provider: "stripe",
      providerEventId: id,
      rawType,
      kind: sub ? "subscription_renewed" : "ignored",
      orderId,
      sku,
      providerCustomerId:
        typeof obj.customer === "string" ? obj.customer : undefined,
      providerSubscriptionId: sub,
      providerPaymentId:
        typeof obj.payment_intent === "string" ? obj.payment_intent : undefined,
      status: "paid",
    };
  }

  return {
    provider: "stripe",
    providerEventId: id || `unknown_${rawType}`,
    rawType,
    kind: "ignored",
  };
}

export function createStripeProvider(env: ApiEnv): PaymentProvider {
  return {
    id: "stripe",

    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
      const priceId = stripePriceId(env, input.sku);
      if (!priceId) throw new Error("STRIPE_PRICE_NOT_MAPPED");
      const catalog = getSkuCatalog(input.sku);
      const params = new URLSearchParams();
      params.set("mode", catalog.mode);
      params.set("success_url", input.successUrl);
      params.set("cancel_url", input.cancelUrl);
      params.set("client_reference_id", input.orderId);
      params.set("line_items[0][price]", priceId);
      params.set("line_items[0][quantity]", "1");
      params.set("metadata[order_id]", input.orderId);
      params.set("metadata[user_id]", input.userId);
      params.set("metadata[sku]", input.sku);
      params.set("metadata[plan_version]", input.planVersion);
      if (input.email) params.set("customer_email", input.email);
      if (catalog.mode === "subscription") {
        params.set("subscription_data[metadata][order_id]", input.orderId);
        params.set("subscription_data[metadata][user_id]", input.userId);
        params.set("subscription_data[metadata][sku]", input.sku);
        params.set("subscription_data[metadata][plan_version]", input.planVersion);
      }

      const session = await stripeForm(env, "/checkout/sessions", params);
      const url = typeof session.url === "string" ? session.url : null;
      const id = typeof session.id === "string" ? session.id : null;
      if (!url || !id) throw new Error("STRIPE_CHECKOUT_MISSING_URL");
      return { url, providerSessionId: id };
    },

    async verifyAndParseWebhook(request: Request, rawBody: string) {
      const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
      if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET_MISSING");
      const header = request.headers.get("stripe-signature");
      const ok = await verifyStripeSignature(rawBody, header, secret);
      if (!ok) throw new Error("STRIPE_WEBHOOK_INVALID_SIGNATURE");
      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      return normalizeStripeEvent(payload);
    },

    async createPortal(input: CreatePortalInput) {
      const params = new URLSearchParams();
      params.set("customer", input.providerCustomerId);
      params.set("return_url", input.returnUrl);
      const session = await stripeForm(env, "/billing_portal/sessions", params);
      const url = typeof session.url === "string" ? session.url : null;
      if (!url) throw new Error("STRIPE_PORTAL_MISSING_URL");
      return { url };
    },
  };
}
