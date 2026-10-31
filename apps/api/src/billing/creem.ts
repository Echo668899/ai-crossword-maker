import type { ApiEnv } from "../env";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedBillingEvent,
  PaymentProvider,
} from "./types";
import { isCheckoutSku } from "./types";
import { timingSafeEqualHex } from "./stripe";

export function creemConfigured(env: ApiEnv): boolean {
  return Boolean(env.CREEM_API_KEY?.trim());
}

export function creemProductsMapped(env: ApiEnv): boolean {
  return Boolean(
    env.CREEM_PRODUCT_PRO_MONTHLY?.trim() &&
      env.CREEM_PRODUCT_PRO_YEARLY?.trim() &&
      env.CREEM_PRODUCT_CREDITS_50?.trim() &&
      env.CREEM_PRODUCT_CREDITS_100?.trim() &&
      env.CREEM_PRODUCT_ACTIVITY_PACK?.trim(),
  );
}

function creemBase(env: ApiEnv): string {
  const raw = env.CREEM_API_BASE?.trim();
  if (raw) return raw.replace(/\/$/, "");
  // Default to test API; production should set CREEM_API_BASE=https://api.creem.io
  return "https://test-api.creem.io";
}

function creemProductId(env: ApiEnv, sku: CreateCheckoutInput["sku"]): string | null {
  const map: Record<CreateCheckoutInput["sku"], string | undefined> = {
    pro_monthly: env.CREEM_PRODUCT_PRO_MONTHLY,
    pro_yearly: env.CREEM_PRODUCT_PRO_YEARLY,
    credits_50: env.CREEM_PRODUCT_CREDITS_50,
    credits_100: env.CREEM_PRODUCT_CREDITS_100,
    activity_pack: env.CREEM_PRODUCT_ACTIVITY_PACK,
  };
  const id = map[sku]?.trim();
  return id || null;
}

/** Creem: HMAC-SHA256 hex of raw body with webhook secret; header `creem-signature`. */
export async function verifyCreemSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(expected, header.trim().toLowerCase()) ||
    timingSafeEqualHex(expected, header.trim());
}

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function nestedId(obj: unknown): string | undefined {
  if (typeof obj === "string") return obj;
  if (obj && typeof obj === "object" && "id" in obj) {
    const id = (obj as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

export function normalizeCreemEvent(payload: Record<string, unknown>): NormalizedBillingEvent {
  const id = pickString(payload.id, payload.event_id) ?? "";
  const rawType = pickString(payload.eventType, payload.event_type, payload.type) ?? "";
  const object =
    (payload.object as Record<string, unknown> | undefined) ??
    (payload.data as Record<string, unknown> | undefined) ??
    payload;

  const metadata =
    (object.metadata as Record<string, unknown> | undefined) ??
    (payload.metadata as Record<string, unknown> | undefined);

  const orderId = pickString(
    object.request_id,
    object.requestId,
    metadata?.order_id,
    metadata?.orderId,
    payload.request_id,
  );
  const skuRaw = pickString(metadata?.sku, object.sku);
  const sku = skuRaw && isCheckoutSku(skuRaw) ? skuRaw : undefined;

  const providerCustomerId = pickString(
    nestedId(object.customer),
    object.customer_id,
    object.customerId,
  );
  const providerSubscriptionId = pickString(
    nestedId(object.subscription),
    object.subscription_id,
    object.subscriptionId,
  );
  const providerPaymentId = pickString(
    nestedId(object.order),
    object.order_id,
    object.orderId,
  );
  const providerSessionId = pickString(object.id, object.checkout_id, object.checkoutId);

  if (rawType === "checkout.completed") {
    return {
      provider: "creem",
      providerEventId: id,
      rawType,
      kind: "checkout_paid",
      orderId,
      sku,
      providerCustomerId,
      providerSubscriptionId,
      providerPaymentId,
      providerSessionId,
      status: "complete",
    };
  }

  if (
    rawType === "subscription.active" ||
    rawType === "subscription.update" ||
    rawType === "subscription.trialing" ||
    rawType === "subscription.past_due" ||
    rawType === "subscription.unpaid" ||
    rawType === "subscription.paused"
  ) {
    const statusMap: Record<string, string> = {
      "subscription.active": "active",
      "subscription.update": pickString(object.status) ?? "active",
      "subscription.trialing": "trialing",
      "subscription.past_due": "past_due",
      "subscription.unpaid": "unpaid",
      "subscription.paused": "paused",
    };
    return {
      provider: "creem",
      providerEventId: id,
      rawType,
      kind: "subscription_updated",
      orderId,
      sku,
      providerCustomerId,
      providerSubscriptionId: providerSubscriptionId ?? nestedId(object),
      status: statusMap[rawType] ?? pickString(object.status),
      currentPeriodStart: pickString(object.current_period_start_date, object.current_period_start),
      currentPeriodEnd: pickString(object.current_period_end_date, object.current_period_end),
      cancelAtPeriodEnd: Boolean(object.canceled_at || object.cancel_at_period_end),
    };
  }

  if (rawType === "subscription.paid") {
    return {
      provider: "creem",
      providerEventId: id,
      rawType,
      kind: "subscription_renewed",
      orderId,
      sku,
      providerCustomerId,
      providerSubscriptionId: providerSubscriptionId ?? nestedId(object),
      providerPaymentId,
      status: "active",
      currentPeriodStart: pickString(object.current_period_start_date, object.current_period_start),
      currentPeriodEnd: pickString(object.current_period_end_date, object.current_period_end),
    };
  }

  if (
    rawType === "subscription.canceled" ||
    rawType === "subscription.expired" ||
    rawType === "subscription.scheduled_cancel"
  ) {
    return {
      provider: "creem",
      providerEventId: id,
      rawType,
      kind: "subscription_canceled",
      orderId,
      sku,
      providerCustomerId,
      providerSubscriptionId: providerSubscriptionId ?? nestedId(object),
      status: rawType === "subscription.expired" ? "expired" : "canceled",
    };
  }

  return {
    provider: "creem",
    providerEventId: id || `unknown_${rawType}`,
    rawType,
    kind: "ignored",
  };
}

export function createCreemProvider(env: ApiEnv): PaymentProvider {
  return {
    id: "creem",

    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
      const productId = creemProductId(env, input.sku);
      if (!productId) throw new Error("CREEM_PRODUCT_NOT_MAPPED");
      const key = env.CREEM_API_KEY?.trim();
      if (!key) throw new Error("CREEM_NOT_CONFIGURED");

      const body = {
        product_id: productId,
        request_id: input.orderId,
        success_url: input.successUrl,
        customer: input.email ? { email: input.email } : undefined,
        metadata: {
          order_id: input.orderId,
          user_id: input.userId,
          sku: input.sku,
          plan_version: input.planVersion,
        },
      };

      const res = await fetch(`${creemBase(env)}/v1/checkouts`, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          typeof json.message === "string"
            ? json.message
            : typeof (json.error as { message?: string } | undefined)?.message === "string"
              ? (json.error as { message: string }).message
              : `Creem API ${res.status}`;
        throw new Error(msg);
      }
      const url = pickString(json.checkout_url, json.checkoutUrl);
      const id = pickString(json.id);
      if (!url || !id) throw new Error("CREEM_CHECKOUT_MISSING_URL");
      return { url, providerSessionId: id };
    },

    async verifyAndParseWebhook(request: Request, rawBody: string) {
      const secret = env.CREEM_WEBHOOK_SECRET?.trim();
      if (!secret) throw new Error("CREEM_WEBHOOK_SECRET_MISSING");
      const header = request.headers.get("creem-signature");
      const ok = await verifyCreemSignature(rawBody, header, secret);
      if (!ok) throw new Error("CREEM_WEBHOOK_INVALID_SIGNATURE");
      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      return normalizeCreemEvent(payload);
    },
  };
}
