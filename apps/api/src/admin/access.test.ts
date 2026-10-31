import { describe, expect, it } from "vitest";
import { adminConfigured, adminEmails, isAdminUser } from "./access";
import type { ApiEnv } from "../env";
import type { AuthUser } from "../auth/session";

function env(emails?: string): ApiEnv {
  return { ADMIN_EMAILS: emails } as ApiEnv;
}

function user(email: string | null): AuthUser {
  return {
    id: "u1",
    email,
    name: null,
    emailVerified: true,
    planVersion: null,
  };
}

describe("admin access", () => {
  it("parses ADMIN_EMAILS and denies when empty", () => {
    expect(adminEmails(env(""))).toEqual([]);
    expect(adminConfigured(env(""))).toBe(false);
    expect(isAdminUser(env(""), user("ops@example.com"))).toBe(false);
  });

  it("matches case-insensitive allowlist", () => {
    const e = env("Ops@Example.com, other@test.com");
    expect(adminEmails(e)).toEqual(["ops@example.com", "other@test.com"]);
    expect(adminConfigured(e)).toBe(true);
    expect(isAdminUser(e, user("ops@example.com"))).toBe(true);
    expect(isAdminUser(e, user("OPS@EXAMPLE.COM"))).toBe(true);
    expect(isAdminUser(e, user("nobody@example.com"))).toBe(false);
    expect(isAdminUser(e, user(null))).toBe(false);
  });
});
