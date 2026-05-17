import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-172 / KAI-218: OAuth callback routing logic — pure unit tests
//
// Tests cover the decision tree without HTTP or Supabase dependencies.
// The logic is extracted from route.ts so these tests stay fast and isolated.
//
// Execution order in route.ts (KAI-218):
//   1. OAuth/session error → bail early
//   2. Duplicate email detection → bail early
//   3. Resolve existing membership (Scenario 1)
//   4. Accept pending invitation if no membership (Scenario 3)
//   5. Provision new account if still no membership (Scenario 4)
//   6. Save Gmail channel (account_id guaranteed)
//   7. Route based on which scenario resolved
// ---------------------------------------------------------------------------

function detectOauthError(errorDesc: string): "duplicate_email" | "generic" | null {
  if (!errorDesc) return null;
  const lower = errorDesc.toLowerCase();
  if (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists")
  ) {
    return "duplicate_email";
  }
  return "generic";
}

function resolveCallbackDestination(opts: {
  oauthError: string | null;
  sessionError: boolean;
  hasExistingMembership: boolean;
  acceptedInvitation: boolean;
  provisioningFailed: boolean;
  enableDetectionUi?: boolean;
}): string {
  if (opts.oauthError) {
    const kind = detectOauthError(opts.oauthError);
    return kind === "duplicate_email"
      ? "/auth/error?type=duplicate_email"
      : "/auth/error?type=oauth_error";
  }
  if (opts.sessionError)        return "/auth/error?type=session_error";
  if (opts.provisioningFailed)  return "/auth/error?type=provisioning_failed";

  // Scenario 1 — pre-existing member
  if (opts.hasExistingMembership) {
    return opts.enableDetectionUi ? "/wizard/detect" : "/auth/handoff";
  }

  // Scenario 3 — invitation just accepted
  if (opts.acceptedInvitation)  return "/auth/handoff";

  // Scenario 4 — account just provisioned
  return "/wizard/complete";
}

// ── detectOauthError ──────────────────────────────────────────────────────

describe("detectOauthError — kept for future Supabase error-param handling", () => {
  it("identifies duplicate email — 'already registered'", () => {
    expect(detectOauthError("User already registered")).toBe("duplicate_email");
  });

  it("identifies duplicate email — 'already been registered'", () => {
    expect(detectOauthError("A user with this email has already been registered")).toBe("duplicate_email");
  });

  it("identifies duplicate email — 'user already exists'", () => {
    expect(detectOauthError("user already exists")).toBe("duplicate_email");
  });

  it("is case-insensitive", () => {
    expect(detectOauthError("USER ALREADY REGISTERED")).toBe("duplicate_email");
  });

  it("treats unknown errors as generic", () => {
    expect(detectOauthError("access_denied")).toBe("generic");
  });

  it("returns null for empty string", () => {
    expect(detectOauthError("")).toBeNull();
  });
});

// ── Scenario 2 — OAuth/duplicate errors ──────────────────────────────────

describe("resolveCallbackDestination — Scenario 2 (OAuth / duplicate errors)", () => {
  it("duplicate email → /auth/error?type=duplicate_email", () => {
    expect(resolveCallbackDestination({
      oauthError: "User already registered",
      sessionError: false, hasExistingMembership: false,
      acceptedInvitation: false, provisioningFailed: false,
    })).toBe("/auth/error?type=duplicate_email");
  });

  it("generic oauth error → /auth/error?type=oauth_error", () => {
    expect(resolveCallbackDestination({
      oauthError: "access_denied",
      sessionError: false, hasExistingMembership: false,
      acceptedInvitation: false, provisioningFailed: false,
    })).toBe("/auth/error?type=oauth_error");
  });

  it("session exchange failure → /auth/error?type=session_error", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: true,
      hasExistingMembership: false, acceptedInvitation: false,
      provisioningFailed: false,
    })).toBe("/auth/error?type=session_error");
  });
});

// ── Scenario 1 — returning user ───────────────────────────────────────────

describe("resolveCallbackDestination — Scenario 1 (returning user)", () => {
  it("existing member → /auth/handoff (detection UI off)", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasExistingMembership: true, acceptedInvitation: false,
      provisioningFailed: false, enableDetectionUi: false,
    })).toBe("/auth/handoff");
  });

  it("existing member → /wizard/detect (detection UI on)", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasExistingMembership: true, acceptedInvitation: false,
      provisioningFailed: false, enableDetectionUi: true,
    })).toBe("/wizard/detect");
  });
});

// ── Scenario 3 — pending invitation ──────────────────────────────────────

describe("resolveCallbackDestination — Scenario 3 (invitation accepted)", () => {
  it("invitation accepted → /auth/handoff", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasExistingMembership: false, acceptedInvitation: true,
      provisioningFailed: false,
    })).toBe("/auth/handoff");
  });

  it("pre-existing membership takes priority over invitation flag", () => {
    // If user already had a membership AND there was a pending invitation,
    // the invitation path is skipped; user goes to handoff via Scenario 1.
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasExistingMembership: true, acceptedInvitation: true,
      provisioningFailed: false,
    })).toBe("/auth/handoff");
  });
});

// ── Scenario 4 — brand-new user ───────────────────────────────────────────

describe("resolveCallbackDestination — Scenario 4 (new user, account provisioned)", () => {
  it("account just provisioned → /wizard/complete", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasExistingMembership: false, acceptedInvitation: false,
      provisioningFailed: false,
    })).toBe("/wizard/complete");
  });

  it("provisioning RPC failure → /auth/error?type=provisioning_failed", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasExistingMembership: false, acceptedInvitation: false,
      provisioningFailed: true,
    })).toBe("/auth/error?type=provisioning_failed");
  });

  it("provisioning failure is NOT masked by oauth error presence", () => {
    // oauth error takes precedence — provisioning never ran
    expect(resolveCallbackDestination({
      oauthError: "access_denied",
      sessionError: false, hasExistingMembership: false,
      acceptedInvitation: false, provisioningFailed: true,
    })).toBe("/auth/error?type=oauth_error");
  });
});

// ── Ordering guarantees (KAI-218) ─────────────────────────────────────────

describe("resolveCallbackDestination — ordering invariants", () => {
  it("oauth error takes priority over session error (oauth is checked first in route)", () => {
    // oauthError is read from URL params before exchangeCodeForSession runs.
    // sessionError=true is impossible when oauthError is present — the code
    // returns early — but the decision function still reflects real priority.
    expect(resolveCallbackDestination({
      oauthError: "access_denied", sessionError: true,
      hasExistingMembership: true, acceptedInvitation: true,
      provisioningFailed: true,
    })).toBe("/auth/error?type=oauth_error");
  });

  it("session error (no oauth error) takes priority over membership/provisioning state", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: true,
      hasExistingMembership: true, acceptedInvitation: true,
      provisioningFailed: true,
    })).toBe("/auth/error?type=session_error");
  });

  it("oauth error takes priority over membership/provisioning state", () => {
    expect(resolveCallbackDestination({
      oauthError: "User already registered", sessionError: false,
      hasExistingMembership: true, acceptedInvitation: false,
      provisioningFailed: false,
    })).toBe("/auth/error?type=duplicate_email");
  });

  it("Scenario 1 takes priority over Scenario 4 — no provisioning for existing members", () => {
    // Even if provisioningFailed=false (as it would be since RPC was never called
    // for existing members), hasExistingMembership wins.
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasExistingMembership: true, acceptedInvitation: false,
      provisioningFailed: false,
    })).toBe("/auth/handoff");
  });
});
