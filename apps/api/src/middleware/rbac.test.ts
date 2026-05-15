import { describe, it, expect } from "bun:test";
import { isRoleAllowed, type DashboardRole } from "./rbac-check.js";

// ---------------------------------------------------------------------------
// KAI-170: RBAC isolation — account_members-based role check
// ---------------------------------------------------------------------------

const ALL_ROLES: DashboardRole[] = ["owner", "admin", "supervisor", "agent"];

describe("isRoleAllowed — null / missing member", () => {
  it("denies null (user not in account)", () => {
    expect(isRoleAllowed(null, ALL_ROLES)).toBe(false);
  });

  it("denies undefined", () => {
    expect(isRoleAllowed(undefined, ALL_ROLES)).toBe(false);
  });
});

describe("isRoleAllowed — status guard", () => {
  it("denies suspended member even if role matches", () => {
    expect(isRoleAllowed({ role: "owner", status: "suspended" }, ["owner"])).toBe(false);
  });

  it("denies invited member (not yet accepted)", () => {
    expect(isRoleAllowed({ role: "agent", status: "invited" }, ALL_ROLES)).toBe(false);
  });

  it("allows active member", () => {
    expect(isRoleAllowed({ role: "agent", status: "active" }, ALL_ROLES)).toBe(true);
  });
});

describe("isRoleAllowed — role matching", () => {
  it("allows owner when owner is in allowedRoles", () => {
    expect(isRoleAllowed({ role: "owner", status: "active" }, ["owner"])).toBe(true);
  });

  it("denies agent when only owner|admin allowed", () => {
    expect(isRoleAllowed({ role: "agent", status: "active" }, ["owner", "admin"])).toBe(false);
  });

  it("allows admin when owner|admin allowed", () => {
    expect(isRoleAllowed({ role: "admin", status: "active" }, ["owner", "admin"])).toBe(true);
  });

  it("denies unknown role string", () => {
    expect(isRoleAllowed({ role: "superuser", status: "active" }, ALL_ROLES)).toBe(false);
  });
});

describe("isRoleAllowed — account isolation contract", () => {
  // These tests document the contract: the DB query in requireRole()
  // filters by BOTH user_id AND account_id before passing the row here.
  // If the user does not belong to the requested account, Supabase returns
  // null — and isRoleAllowed(null, ...) must always return false.

  it("no cross-account access: member of account A cannot access account B (null row)", () => {
    // Supabase returns null when account_id filter doesn't match
    expect(isRoleAllowed(null, ALL_ROLES)).toBe(false);
  });

  it("active owner of account A is denied if queried for account B (null row)", () => {
    // The middleware queries with .eq('account_id', headerAccountId)
    // so a real owner of a different account resolves to null here
    expect(isRoleAllowed(null, ["owner"])).toBe(false);
  });
});
