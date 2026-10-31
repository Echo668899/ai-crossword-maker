import { describe, expect, it } from "vitest";
import {
  normalizeStripeEvent,
  timingSafeEqualHex,
  verifyStripeSignature,
} from "./stripe";

describe("timingSafeEqualHex", () => {
  it("matches equal hex", () => {
    expect(timingSafeEqualHex("abc123", "abc123")).toBe(true);
  });
  it("rejects different length", () => {
    expect(timingSafeEqualHex("ab", "abcd")).toBe(false);
  });
  it("rejects different content", () => {
    expect(timingSafeEqualHex("abc123", "abc124")).toBe(false);
  });
});

describe("verifyStripeSignature", () => {
  it("accepts a valid signature within tolerance", async () => {
    const secret = "whsec_test_secret";
    const body = '{"id":"evt_1","type":"checkout.session.completed"}';
    const t = Math.floor(Date.now() / 1000);
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
      new TextEncoder().encode(`${t}.${body}`),
    );
    const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const ok = await verifyStripeSignature(body, `t=${t},v1=${v1}`, secret);
    expect(ok).toBe(true);
  });

  it("rejects missing header", async () => {
    const ok = await verifyStripeSignature("{}", null, "secret");
    expect(ok).toBe(false);
  });
});

describe("normalizeStripeEvent", () => {
  it("maps checkout.session.completed", () => {
    const ev = normalizeStripeEvent({
      id: "evt_cs",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          customer: "cus_1",
          subscription: "sub_1",
          payment_intent: "pi_1",
          status: "complete",
          metadata: { order_id: "ord1", sku: "pro_monthly" },
        },
      },
    });
    expect(ev.kind).toBe("checkout_paid");
    expect(ev.orderId).toBe("ord1");
    expect(ev.sku).toBe("pro_monthly");
    expect(ev.providerSessionId).toBe("cs_test");
  });

  it("maps subscription deleted", () => {
    const ev = normalizeStripeEvent({
      id: "evt_del",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_x", customer: "cus_x", status: "canceled" } },
    });
    expect(ev.kind).toBe("subscription_canceled");
    expect(ev.providerSubscriptionId).toBe("sub_x");
  });

  it("ignores unknown types", () => {
    const ev = normalizeStripeEvent({ id: "evt_z", type: "ping" });
    expect(ev.kind).toBe("ignored");
  });
});
