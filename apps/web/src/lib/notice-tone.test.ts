import { describe, expect, it } from "vitest";
import { noticeToneFromCopy } from "./notice-tone";

describe("noticeToneFromCopy", () => {
  it("marks quota exhaustion as warn even when the copy also says upgrade", () => {
    expect(
      noticeToneFromCopy(
        "You've used today's free Generate clues. Upgrade to Pro for unlimited AI clues — or keep typing clues yourself.",
      ),
    ).toBe("warn");
    expect(
      noticeToneFromCopy(
        "Free Generate clues used up for today. Upgrade to Pro for unlimited clues, or type them manually.",
      ),
    ).toBe("warn");
    expect(
      noticeToneFromCopy(
        "AI quota exhausted for today — Build grid / Examples still work. See Pricing for Pro.",
      ),
    ).toBe("warn");
    expect(
      noticeToneFromCopy("Daily anonymous AI demo limit reached (3/day). Use manual mode or examples."),
    ).toBe("warn");
  });

  it("marks Activity Pack / Pro purchase gates as upsell", () => {
    expect(
      noticeToneFromCopy(
        "Activity packs require an Activity Pack purchase or Pro. Free plan can still print a single layout.",
      ),
    ).toBe("upsell");
    expect(
      noticeToneFromCopy(
        "Free plan: 2 of 3 AI ops left today (includes Generate clues). Upgrade to Pro for unlimited clues. Layout reshuffles stay free.",
      ),
    ).toBe("upsell");
    expect(noticeToneFromCopy("Batch export requires Activity Pack or Pro.")).toBe("upsell");
    expect(
      noticeToneFromCopy("Free plan allows 3 cloud projects. Archive one or upgrade later."),
    ).toBe("upsell");
    expect(
      noticeToneFromCopy(
        "Free PDFs include a crosswordmaker.app footer. Pro removes it. Activity packs require an Activity Pack purchase or Pro.",
      ),
    ).toBe("upsell");
    expect(
      noticeToneFromCopy("When the daily demo runs out, keep building manually — or upgrade for more AI ops."),
    ).toBe("upsell");
  });

  it("marks entitled / still-free facts as cool info", () => {
    expect(
      noticeToneFromCopy("Pro: Generate clues is unlimited. Topic demo may still use the free daily pool."),
    ).toBe("info");
    expect(
      noticeToneFromCopy("Pro: PDFs have no site footer. Activity packs and batch export are included."),
    ).toBe("info");
    expect(noticeToneFromCopy("Welcome to Pro — your entitlements refresh after webhook confirmation.")).toBe(
      "info",
    );
    expect(noticeToneFromCopy("No entitlement ledger yet.")).toBe("info");
    expect(
      noticeToneFromCopy(
        "Checkout is offline until payment secrets are configured. Free AI demo and manual maker remain available.",
      ),
    ).toBe("info");
  });

  it("leaves instructional muted copy untoned", () => {
    expect(noticeToneFromCopy("Program builds the grid. AI only suggests words and clues when enabled.")).toBe(
      null,
    );
    expect(noticeToneFromCopy("Building grid…")).toBe(null);
    expect(noticeToneFromCopy("No cloud puzzles yet — Save to cloud after you build a grid.")).toBe(null);
    expect(noticeToneFromCopy("Paper size")).toBe(null);
  });
});
