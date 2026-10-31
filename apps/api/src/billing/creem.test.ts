import { describe, expect, it } from "vitest";
import { normalizeCreemEvent, verifyCreemSignature } from "./creem";

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
