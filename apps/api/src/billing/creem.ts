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
  return Boolean(normalizeCreemApiKey(env.CREEM_API_KEY));
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

export type CreemKeyMode = "test" | "live" | "unknown";
export type CreemApiBaseMode = "test" | "live";

const PRODUCT_ID_RE = /prod_[A-Za-z0-9]+/;

/** Strip wrapping quotes; never log the value. */
export function normalizeCreemApiKey(raw: string | undefined): string {
  let key = raw?.trim() ?? "";
  if (
    ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) &&
    key.length > 1
  ) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

/** Creem test keys are `creem_test_…`; live keys are `creem_…` (not test). */
export function creemKeyMode(apiKey: string | undefined): CreemKeyMode {
  const key = normalizeCreemApiKey(apiKey);
  if (!key) return "unknown";
  if (key.startsWith("creem_test_")) return "test";
  if (key.startsWith("creem_")) return "live";
  return "unknown";
}

export function creemConfiguredApiBaseMode(env: ApiEnv): CreemApiBaseMode {
  const raw = env.CREEM_API_BASE?.trim().replace(/\/$/, "") ?? "";
  if (raw.includes("test-api.creem.io")) return "test";
  if (raw.includes("api.creem.io")) return "live";
  // Code default (when unset) is test; production wrangler sets live.
  return raw ? "live" : "test";
}

/**
 * Creem rejects a test key on the live host (and vice versa). The key prefix is
 * the source of truth; CREEM_API_BASE is used when it matches, or when the key
 * prefix is unrecognized.
 */
export function resolveCreemApiBase(env: ApiEnv): string {
  const keyMode = creemKeyMode(env.CREEM_API_KEY);
  const fromKey = keyMode === "test" ? "https://test-api.creem.io" : "https://api.creem.io";
  const raw = env.CREEM_API_BASE?.trim().replace(/\/$/, "");
  if (!raw) {
    return keyMode === "live" ? "https://api.creem.io" : "https://test-api.creem.io";
  }
  if (keyMode === "unknown") return raw;
  const rawIsTest = raw.includes("test-api.creem.io");
  if ((keyMode === "test") !== rawIsTest) return fromKey;
  return raw;
}

export function creemEffectiveApiBaseMode(env: ApiEnv): CreemApiBaseMode {
  return resolveCreemApiBase(env).includes("test-api.creem.io") ? "test" : "live";
}

/** Strip quotes / extract `prod_…` from a pasted dashboard URL. Never log the value. */
export function normalizeCreemProductId(raw: string | undefined): string | null {
  let id = raw?.trim() ?? "";
  if (!id) return null;
  if (
    ((id.startsWith('"') && id.endsWith('"')) || (id.startsWith("'") && id.endsWith("'"))) &&
    id.length > 1
  ) {
    id = id.slice(1, -1).trim();
  }
  if (/^https?:\/\//i.test(id) || id.includes("/")) {
    const m = id.match(PRODUCT_ID_RE);
    if (m) return m[0];
  }
  return id || null;
}

export function creemProductIdsFormatOk(env: ApiEnv): boolean {
  const ids = [
    env.CREEM_PRODUCT_PRO_MONTHLY,
    env.CREEM_PRODUCT_PRO_YEARLY,
    env.CREEM_PRODUCT_CREDITS_50,
    env.CREEM_PRODUCT_CREDITS_100,
    env.CREEM_PRODUCT_ACTIVITY_PACK,
  ].map(normalizeCreemProductId);
  return ids.every((id) => Boolean(id && id.startsWith("prod_")));
}

export function creemDiagnostics(env: ApiEnv): {
  configured: boolean;
  productsMapped: boolean;
  keyMode: CreemKeyMode;
  configuredApiBaseMode: CreemApiBaseMode;
  effectiveApiBaseMode: CreemApiBaseMode;
  modeAligned: boolean;
  productIdFormatOk: boolean;
} {
  const keyMode = creemKeyMode(env.CREEM_API_KEY);
  const configuredApiBaseMode = creemConfiguredApiBaseMode(env);
  const effectiveApiBaseMode = creemEffectiveApiBaseMode(env);
  return {
    configured: creemConfigured(env),
    productsMapped: creemProductsMapped(env),
    keyMode,
    configuredApiBaseMode,
    effectiveApiBaseMode,
    modeAligned: keyMode === "unknown" || keyMode === configuredApiBaseMode,
    productIdFormatOk: creemProductIdsFormatOk(env),
  };
}

export class CreemCheckoutError extends Error {
  readonly reason: string;
  readonly userMessage: string;
  readonly providerStatus?: number;
  readonly providerTraceId?: string;

  constructor(opts: {
    reason: string;
    userMessage: string;
    logMessage?: string;
    providerStatus?: number;
    providerTraceId?: string;
  }) {
    super(opts.logMessage ?? opts.reason);
    this.name = "CreemCheckoutError";
    this.reason = opts.reason;
    this.userMessage = opts.userMessage;
    this.providerStatus = opts.providerStatus;
    this.providerTraceId = opts.providerTraceId;
  }
}

export function parseCreemErrorPayload(json: unknown): {
  messages: string[];
  status?: number;
  traceId?: string;
} {
  if (!json || typeof json !== "object") return { messages: [] };
  const obj = json as Record<string, unknown>;
  const messages: string[] = [];
  if (typeof obj.message === "string" && obj.message.trim()) messages.push(obj.message.trim());
  else if (Array.isArray(obj.message)) {
    for (const m of obj.message) {
      if (typeof m === "string" && m.trim()) messages.push(m.trim());
    }
  }
  const traceId = typeof obj.trace_id === "string" ? obj.trace_id : undefined;
  const status = typeof obj.status === "number" ? obj.status : undefined;
  return { messages, status, traceId };
}

export function extractCreemCheckout(json: Record<string, unknown>): {
  url?: string;
  id?: string;
} {
  const nested =
    json.checkout && typeof json.checkout === "object"
      ? (json.checkout as Record<string, unknown>)
      : json;
  const url = pickString(
    nested.checkout_url,
    nested.checkoutUrl,
    nested.url,
    json.checkout_url,
    json.checkoutUrl,
    json.url,
  );
  const id = pickString(nested.id, json.id, nested.checkout_id, json.checkout_id);
  return { url, id };
}

function safeCreemHint(messages: string[]): string {
  const hint = messages
    .filter((m) => m.length < 160 && !/creem_|whsec|sk_|prod_/i.test(m))
    .join("; ");
  return hint ? ` Creem said: ${hint}.` : "";
}

export function creemUserMessageForStatus(
  status: number,
  messages: string[],
  keyMode: CreemKeyMode,
): { reason: string; userMessage: string } {
  const joined = messages.join(" ").toLowerCase();
  if (status === 403 || status === 401) {
    const liveHint =
      "Recreate a Live API key with Test Mode OFF, grant Checkouts: Write (add Products: Read if it still fails), then wrangler secret put CREEM_API_KEY on Worker acm-api (encrypted secret, not a Dashboard plaintext var). Do not paste the webhook signing secret.";
    const userMessage =
      keyMode === "test"
        ? `Creem HTTP ${status}: a creem_test_ key cannot charge live. Turn Test Mode OFF, copy a Live key (creem_…), secret-put CREEM_API_KEY.`
        : `Creem HTTP ${status}: live API key rejected (invalid, revoked, or missing Checkouts: Write). ${liveHint}`;
    return {
      reason: "creem_forbidden",
      userMessage: userMessage + safeCreemHint(messages),
    };
  }
  if (
    status === 404 ||
    /product not found|invalid product/i.test(joined)
  ) {
    return {
      reason: "creem_product_not_found",
      userMessage:
        "Creem product not found for this plan. Paste the dashboard Product ID (prod_…) into the matching CREEM_PRODUCT_* secret, same test/live mode as the API key.",
    };
  }
  if (status === 400) {
    return {
      reason: "creem_bad_request",
      userMessage:
        "Creem rejected the checkout request. Check product IDs, that Pro SKUs are subscriptions, and that success URL https://crosswordmaker.app is allowed.",
    };
  }
  return {
    reason: "creem_api_error",
    userMessage:
      "Could not start checkout. Verify Creem credentials and product mappings (test vs live must match).",
  };
}

function creemBase(env: ApiEnv): string {
  return resolveCreemApiBase(env);
}

function creemProductId(env: ApiEnv, sku: CreateCheckoutInput["sku"]): string | null {
  const map: Record<CreateCheckoutInput["sku"], string | undefined> = {
    pro_monthly: env.CREEM_PRODUCT_PRO_MONTHLY,
    pro_yearly: env.CREEM_PRODUCT_PRO_YEARLY,
    credits_50: env.CREEM_PRODUCT_CREDITS_50,
    credits_100: env.CREEM_PRODUCT_CREDITS_100,
    activity_pack: env.CREEM_PRODUCT_ACTIVITY_PACK,
  };
  return normalizeCreemProductId(map[sku]);
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
      if (!productId) {
        throw new CreemCheckoutError({
          reason: "creem_product_unmapped",
          userMessage:
            "This plan has no Creem product id. Set the matching CREEM_PRODUCT_* Worker secret.",
          logMessage: "CREEM_PRODUCT_NOT_MAPPED",
        });
      }
      const key = normalizeCreemApiKey(env.CREEM_API_KEY);
      if (!key) {
        throw new CreemCheckoutError({
          reason: "creem_not_configured",
          userMessage: "Creem API key is missing on the Worker.",
          logMessage: "CREEM_NOT_CONFIGURED",
        });
      }

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

      let res: Response;
      try {
        res = await fetch(`${creemBase(env)}/v1/checkouts`, {
          method: "POST",
          headers: {
            "x-api-key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new CreemCheckoutError({
          reason: "creem_unreachable",
          userMessage: "Could not reach Creem. Retry in a moment.",
          logMessage: "CREEM_FETCH_FAILED",
        });
      }

      const text = await res.text();
      let json: Record<string, unknown> = {};
      if (text) {
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new CreemCheckoutError({
            reason: "creem_bad_response",
            userMessage:
              "Creem returned a non-JSON response. Check CREEM_API_BASE and that the API key matches test vs live.",
            logMessage: `CREEM_NON_JSON_${res.status}`,
            providerStatus: res.status,
          });
        }
      }

      if (!res.ok) {
        const parsed = parseCreemErrorPayload(json);
        const mapped = creemUserMessageForStatus(
          res.status,
          parsed.messages,
          creemKeyMode(key),
        );
        throw new CreemCheckoutError({
          reason: mapped.reason,
          userMessage: mapped.userMessage,
          logMessage: `CREEM_API_${res.status}`,
          providerStatus: res.status,
          providerTraceId: parsed.traceId,
        });
      }

      const session = extractCreemCheckout(json);
      if (!session.url || !session.id) {
        throw new CreemCheckoutError({
          reason: "creem_missing_checkout_url",
          userMessage:
            "Creem created a session but returned no checkout URL. Confirm the product is active in the same mode as the API key.",
          logMessage: "CREEM_CHECKOUT_MISSING_URL",
        });
      }
      return { url: session.url, providerSessionId: session.id };
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
