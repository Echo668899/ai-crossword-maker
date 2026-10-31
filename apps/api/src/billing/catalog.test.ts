import { describe, expect, it } from "vitest";
import { getSkuCatalog, planVersion } from "./catalog";
import { CHECKOUT_SKUS } from "./types";

describe("catalog", () => {
  it("covers every checkout SKU", () => {
    for (const sku of CHECKOUT_SKUS) {
      const entry = getSkuCatalog(sku);
      expect(entry.sku).toBe(sku);
      expect(entry.amountCents).toBeGreaterThan(0);
      expect(entry.grants.length).toBeGreaterThan(0);
    }
  });

  it("marks pro as subscription and credits as payment", () => {
    expect(getSkuCatalog("pro_monthly").mode).toBe("subscription");
    expect(getSkuCatalog("credits_50").mode).toBe("payment");
  });

  it("uses env plan version override", () => {
    expect(planVersion("custom.v9")).toBe("custom.v9");
  });
});
