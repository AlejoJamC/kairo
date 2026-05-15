import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-172: OAuth callback routing logic — pure unit tests
// Tests cover the decision tree without HTTP or Supabase dependencies.
// ---------------------------------------------------------------------------

type Scenario =
  | "existing_member"       // user already has account_members row
  | "pending_invitation"    // user email matches account_invitations
  | "new_user"              // no membership, no invitation
  | "oauth_error"           // Supabase returned ?error= param
  | "duplicate_email";      // email already registered with different provider

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
  hasMembership: boolean;
  hasPendingInvitation: boolean;
}): string {
  if (opts.oauthError) {
    const kind = detectOauthError(opts.oauthError);
    return kind === "duplicate_email"
      ? "/auth/error?type=duplicate_email"
      : `/auth/error?type=oauth_error`;
  }
  if (opts.sessionError)   return "/auth/error?type=session_error";
  if (opts.hasMembership)  return "/auth/handoff";
  if (opts.hasPendingInvitation) return "/auth/handoff";
  return "/wizard/complete";
}

// ── OAuth error detection ──────────────────────────────────────────────────

describe("detectOauthError", () => {
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

// ── Callback destination routing ───────────────────────────────────────────

describe("resolveCallbackDestination — OAuth error (Scenario 2)", () => {
  it("duplicate email error → /auth/error?type=duplicate_email", () => {
    expect(resolveCallbackDestination({
      oauthError: "User already registered",
      sessionError: false, hasMembership: false, hasPendingInvitation: false,
    })).toBe("/auth/error?type=duplicate_email");
  });

  it("generic oauth error → /auth/error?type=oauth_error", () => {
    expect(resolveCallbackDestination({
      oauthError: "access_denied",
      sessionError: false, hasMembership: false, hasPendingInvitation: false,
    })).toBe("/auth/error?type=oauth_error");
  });
});

describe("resolveCallbackDestination — Scenario 1 & returning users", () => {
  it("existing member → /auth/handoff (skip wizard)", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasMembership: true, hasPendingInvitation: false,
    })).toBe("/auth/handoff");
  });
});

describe("resolveCallbackDestination — Scenario 3 (pending invitation)", () => {
  it("pending invitation → auto-accept then /auth/handoff", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasMembership: false, hasPendingInvitation: true,
    })).toBe("/auth/handoff");
  });

  it("membership takes precedence over invitation (no double-insert)", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasMembership: true, hasPendingInvitation: true,
    })).toBe("/auth/handoff");
  });
});

describe("resolveCallbackDestination — Scenario 4 (new user)", () => {
  it("no membership, no invitation → /wizard/complete", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: false,
      hasMembership: false, hasPendingInvitation: false,
    })).toBe("/wizard/complete");
  });
});

describe("resolveCallbackDestination — session error", () => {
  it("session exchange failure → /auth/error?type=session_error", () => {
    expect(resolveCallbackDestination({
      oauthError: null, sessionError: true,
      hasMembership: false, hasPendingInvitation: false,
    })).toBe("/auth/error?type=session_error");
  });
});
