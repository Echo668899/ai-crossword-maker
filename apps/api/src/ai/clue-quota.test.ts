import { describe, expect, it } from "vitest";
import {
  clueQuotaExceededMessage,
  clueQuotaResponse,
  type ClueQuotaPolicy,
} from "./clue-quota";

describe("clueQuotaExceededMessage", () => {
  it("points free users to Pro unlimited clues", () => {
    const msg = clueQuotaExceededMessage(3);
    expect(msg).toContain("3/day");
    expect(msg).toContain("Upgrade to Pro");
    expect(msg).toContain("unlimited AI clues");
  });
});

describe("clueQuotaResponse", () => {
  it("marks Pro as unlimited with null counters", () => {
    const policy: ClueQuotaPolicy = {
      kind: "unlimited",
      isPro: true,
      day: "2026-11-01",
    };
    expect(clueQuotaResponse(policy)).toEqual({
      unlimited: true,
      isPro: true,
      limit: null,
      remaining: null,
      day: "2026-11-01",
    });
  });

  it("exposes daily remaining for free users", () => {
    const policy: ClueQuotaPolicy = {
      kind: "daily",
      isPro: false,
      snapshot: {
        fingerprint: "fp",
        day: "2026-11-01",
        limit: 3,
        used: 1,
        remaining: 2,
      },
    };
    expect(clueQuotaResponse(policy)).toEqual({
      unlimited: false,
      isPro: false,
      limit: 3,
      remaining: 2,
      day: "2026-11-01",
    });
  });

  it("prefers post-consume snapshot when provided", () => {
    const policy: ClueQuotaPolicy = {
      kind: "daily",
      isPro: false,
      snapshot: {
        fingerprint: "fp",
        day: "2026-11-01",
        limit: 3,
        used: 1,
        remaining: 2,
      },
    };
    expect(
      clueQuotaResponse(policy, {
        fingerprint: "fp",
        day: "2026-11-01",
        limit: 3,
        used: 2,
        remaining: 1,
      }),
    ).toEqual({
      unlimited: false,
      isPro: false,
      limit: 3,
      remaining: 1,
      day: "2026-11-01",
    });
  });
});
