import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../env";
import {
  CreemCheckoutError,
  createCreemProvider,
  creemDiagnostics,
  creemKeyMode,
  extractCreemCheckout,
  normalizeCreemProductId,
  parseCreemErrorPayload,
  resolveCreemApiBase,
  verifyCreemSignature,
  normalizeCreemEvent,
} from "./creem";
import type { CreateCheckoutInput } from "./types";

describe("verifyCreemSignature", () => {
  it("accepts HMAC hex of raw body", async () => {
    const secret = "creem_whsec_test";
    const body = '{"id":"evt_c1","eventType":"checkout.completed"}';
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const sig = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifyCreemSignature(body, sig, secret)).toBe(true);
  });

  it("rejects bad signature", async () => {
    expect(await verifyCreemSignature("{}", "deadbeef", "secret")).toBe(false);
  });
});

describe("normalizeCreemEvent", () => {
  it("maps checkout.completed with request_id", () => {
    const ev = normalizeCreemEvent({
      id: "evt_1",
      eventType: "checkout.completed",
      object: {
        id: "ch_1",
        request_id: "order_abc",
        customer: { id: "cust_1" },
        subscription: { id: "sub_1" },
        order: { id: "ord_creem" },
        metadata: { sku: "credits_50" },
      },
    });
    expect(ev.kind).toBe("checkout_paid");
    expect(ev.orderId).toBe("order_abc");
    expect(ev.sku).toBe("credits_50");
    expect(ev.providerCustomerId).toBe("cust_1");
    expect(ev.providerSubscriptionId).toBe("sub_1");
  });

  it("maps subscription.paid as renewal", () => {
    const ev = normalizeCreemEvent({
      id: "evt_2",
      eventType: "subscription.paid",
      object: { id: "sub_9", status: "active" },
    });
    expect(ev.kind).toBe("subscription_renewed");
    expect(ev.providerSubscriptionId).toBe("sub_9");
  });

  it("maps canceled", () => {
    const ev = normalizeCreemEvent({
      id: "evt_3",
      eventType: "subscription.canceled",
      object: { id: "sub_c" },
    });
    expect(ev.kind).toBe("subscription_canceled");
  });
});

describe("creem key / product helpers", () => {
  it("classifies test vs live key prefixes", () => {
    expect(creemKeyMode("creem_test_abc")).toBe("test");
    expect(creemKeyMode("creem_liveish")).toBe("live");
    expect(creemKeyMode("sk_test")).toBe("unknown");
    expect(creemKeyMode(undefined)).toBe("unknown");
  });

  it("routes a test key to test-api even when CREEM_API_BASE is live", () => {
    expect(
      resolveCreemApiBase({
        CREEM_API_KEY: "creem_test_abc",
        CREEM_API_BASE: "https://api.creem.io",
      }),
    ).toBe("https://test-api.creem.io");
    expect(
      resolveCreemApiBase({
        CREEM_API_KEY: "creem_abc",
        CREEM_API_BASE: "https://api.creem.io",
      }),
    ).toBe("https://api.creem.io");
  });

  it("strips quotes and extracts prod_ from a pasted URL", () => {
    expect(normalizeCreemProductId('"prod_abc123"')).toBe("prod_abc123");
    expect(normalizeCreemProductId("https://creem.io/products/prod_abc123")).toBe("prod_abc123");
    expect(normalizeCreemProductId("   prod_xyz  ")).toBe("prod_xyz");
  });

  it("parses Creem message arrays", () => {
    expect(
      parseCreemErrorPayload({
        status: 404,
        message: ["Product not found"],
        trace_id: "tr_1",
      }),
    ).toEqual({ messages: ["Product not found"], status: 404, traceId: "tr_1" });
  });

  it("extracts nested checkout_url", () => {
    expect(
      extractCreemCheckout({
        checkout: { id: "ch_9", checkout_url: "https://checkout.creem.io/ch_9" },
      }),
    ).toEqual({ id: "ch_9", url: "https://checkout.creem.io/ch_9" });
  });

  it("flags malformed product ids without printing them", () => {
    const d = creemDiagnostics({
      CREEM_API_KEY: "creem_abc",
      CREEM_PRODUCT_PRO_MONTHLY: "not-a-prod",
      CREEM_PRODUCT_PRO_YEARLY: "prod_y",
      CREEM_PRODUCT_CREDITS_50: "prod_50",
      CREEM_PRODUCT_CREDITS_100: "prod_100",
      CREEM_PRODUCT_ACTIVITY_PACK: "prod_ap",
    });
    expect(d.productIdFormatOk).toBe(false);
    expect(d.keyMode).toBe("live");
  });
});

const products: Partial<ApiEnv> = {
  CREEM_PRODUCT_PRO_MONTHLY: "prod_m",
  CREEM_PRODUCT_PRO_YEARLY: "prod_y",
  CREEM_PRODUCT_CREDITS_50: "prod_50",
  CREEM_PRODUCT_CREDITS_100: "prod_100",
  CREEM_PRODUCT_ACTIVITY_PACK: "prod_ap",
};

const checkoutInput: CreateCheckoutInput = {
  orderId: "ord_1",
  userId: "usr_1",
  email: "echo@example.com",
  sku: "pro_monthly",
  planVersion: "v1",
  successUrl: "https://crosswordmaker.app/app/billing/?checkout=success",
  cancelUrl: "https://crosswordmaker.app/pricing/?checkout=canceled",
};

describe("createCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps Creem 404 message array to product-not-found", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            status: 404,
            error: "Bad Request",
            message: ["Product not found"],
            trace_id: "tr_404",
          }),
          { status: 404 },
        ),
    );
    const p = createCreemProvider({
      CREEM_API_KEY: "creem_abc",
      CREEM_API_BASE: "https://api.creem.io",
      ...products,
    });
    await expect(p.createCheckout(checkoutInput)).rejects.toMatchObject({
      name: "CreemCheckoutError",
      reason: "creem_product_not_found",
      providerTraceId: "tr_404",
    } satisfies Partial<CreemCheckoutError>);
  });

  it("maps 403 to forbidden without echoing the key", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ status: 403, error: "Forbidden" }), { status: 403 }),
    );
    const p = createCreemProvider({
      CREEM_API_KEY: "creem_abc",
      ...products,
    });
    try {
      await p.createCheckout(checkoutInput);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CreemCheckoutError);
      const e = err as CreemCheckoutError;
      expect(e.reason).toBe("creem_forbidden");
      expect(e.userMessage).not.toMatch(/creem_abc/);
    }
  });

  it("posts to test-api when the key is creem_test_ despite live CREEM_API_BASE", async () => {
    let url = "";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      url = String(input);
      return new Response(
        JSON.stringify({ id: "ch_1", checkout_url: "https://checkout.creem.io/ch_1" }),
        { status: 200 },
      );
    });
    const p = createCreemProvider({
      CREEM_API_KEY: "creem_test_abc",
      CREEM_API_BASE: "https://api.creem.io",
      ...products,
    });
    const result = await p.createCheckout(checkoutInput);
    expect(url).toBe("https://test-api.creem.io/v1/checkouts");
    expect(result).toEqual({ url: "https://checkout.creem.io/ch_1", providerSessionId: "ch_1" });
  });
});
