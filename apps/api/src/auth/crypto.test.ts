import { describe, expect, it } from "vitest";
import { generateToken, sha256Hex } from "./crypto";

describe("auth crypto", () => {
  it("hashes tokens stably and generates unique values", async () => {
    const a = generateToken(16);
    const b = generateToken(16);
    expect(a).not.toEqual(b);
    const h1 = await sha256Hex(a);
    const h2 = await sha256Hex(a);
    expect(h1).toEqual(h2);
    expect(h1).toHaveLength(64);
  });
});
