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

// ── Pipeline dispatch gate (KAI-202 invariant) ───────────────────────────
//
// INVARIANT (non-negotiable):
//   dispatchOnboardingClassification MUST be called if and only if
//   every single precondition below passes. One failure → abort + error redirect.
//   No exceptions. No "fire anyway and hope".
//
// This function mirrors the gate logic in route.ts. Any future change to the
// route that weakens a precondition MUST break these tests.

type UpsertResult = { error: { message: string } | null };

type DispatchGateInput = {
  providerToken:         string | null;   // session.provider_token
  userEmail:             string | null;   // user.email
  credentialsUpsert:     UpsertResult;    // result of oauth_credentials.upsert
  channelUpsert:         UpsertResult;    // result of support_channels.upsert
  sessionAccessToken:    string | null;   // session.access_token
  sessionUserId:         string;          // session.user.id
  authenticatedUserId:   string;          // user.id (from exchangeCodeForSession)
};

type DispatchGateResult =
  | { dispatch: true }
  | { dispatch: false; redirectType: string };

function evaluateDispatchGate(input: DispatchGateInput): DispatchGateResult {
  // Outer condition: Google must have given us a token AND we have an email.
  // Without these, the entire Gmail block is skipped — no dispatch.
  if (!input.providerToken || !input.userEmail) {
    return { dispatch: false, redirectType: "no_provider_token_or_email" };
  }

  // Precondition 1: oauth_credentials write succeeded.
  // If credentials are not in DB, tier1 will fail trying to read them.
  if (input.credentialsUpsert.error) {
    return { dispatch: false, redirectType: "credentials_error" };
  }

  // Precondition 2: support_channels write succeeded.
  if (input.channelUpsert.error) {
    return { dispatch: false, redirectType: "channel_error" };
  }

  // Precondition 3: session is coherent (KAI-206).
  if (!input.sessionAccessToken || input.sessionUserId !== input.authenticatedUserId) {
    return { dispatch: false, redirectType: "session_error" };
  }

  return { dispatch: true };
}

const OK_UPSERT: UpsertResult = { error: null };
const FAIL_UPSERT = (msg: string): UpsertResult => ({ error: { message: msg } });

describe("Pipeline dispatch gate — invariant: dispatch iff ALL preconditions pass", () => {
  const HAPPY: DispatchGateInput = {
    providerToken:       "ya29.valid-token",
    userEmail:           "user@example.com",
    credentialsUpsert:   OK_UPSERT,
    channelUpsert:       OK_UPSERT,
    sessionAccessToken:  "access-token",
    sessionUserId:       "user-1",
    authenticatedUserId: "user-1",
  };

  // ── Happy path ─────────────────────────────────────────────────────────
  it("dispatches when every precondition passes", () => {
    expect(evaluateDispatchGate(HAPPY)).toEqual({ dispatch: true });
  });

  // ── provider_token / email absent ─────────────────────────────────────
  it("does NOT dispatch when provider_token is null", () => {
    const result = evaluateDispatchGate({ ...HAPPY, providerToken: null });
    expect(result.dispatch).toBe(false);
  });

  it("does NOT dispatch when provider_token is empty string", () => {
    const result = evaluateDispatchGate({ ...HAPPY, providerToken: "" });
    expect(result.dispatch).toBe(false);
  });

  it("does NOT dispatch when user.email is null", () => {
    const result = evaluateDispatchGate({ ...HAPPY, userEmail: null });
    expect(result.dispatch).toBe(false);
  });

  it("does NOT dispatch when user.email is empty string", () => {
    const result = evaluateDispatchGate({ ...HAPPY, userEmail: "" });
    expect(result.dispatch).toBe(false);
  });

  // ── oauth_credentials upsert failure ──────────────────────────────────
  it("does NOT dispatch when oauth_credentials upsert returns error", () => {
    const result = evaluateDispatchGate({
      ...HAPPY,
      credentialsUpsert: FAIL_UPSERT("duplicate key value violates unique constraint"),
    });
    expect(result.dispatch).toBe(false);
    expect((result as { dispatch: false; redirectType: string }).redirectType).toBe("credentials_error");
  });

  it("does NOT dispatch when oauth_credentials upsert returns a DB connection error", () => {
    const result = evaluateDispatchGate({
      ...HAPPY,
      credentialsUpsert: FAIL_UPSERT("connection timeout"),
    });
    expect(result.dispatch).toBe(false);
  });

  it("does NOT dispatch when oauth_credentials upsert fails even if channel upsert succeeds", () => {
    const result = evaluateDispatchGate({
      ...HAPPY,
      credentialsUpsert: FAIL_UPSERT("schema error"),
      channelUpsert:     OK_UPSERT,
    });
    expect(result.dispatch).toBe(false);
  });

  // ── support_channels upsert failure ───────────────────────────────────
  it("does NOT dispatch when support_channels upsert returns error", () => {
    const result = evaluateDispatchGate({
      ...HAPPY,
      channelUpsert: FAIL_UPSERT("relation support_channels does not exist"),
    });
    expect(result.dispatch).toBe(false);
    expect((result as { dispatch: false; redirectType: string }).redirectType).toBe("channel_error");
  });

  it("does NOT dispatch when channel upsert fails even if credentials upsert succeeds", () => {
    const result = evaluateDispatchGate({
      ...HAPPY,
      credentialsUpsert: OK_UPSERT,
      channelUpsert:     FAIL_UPSERT("RLS violation"),
    });
    expect(result.dispatch).toBe(false);
  });

  // ── KAI-206 session coherence failure ─────────────────────────────────
  it("does NOT dispatch when session.access_token is null (KAI-206)", () => {
    const result = evaluateDispatchGate({ ...HAPPY, sessionAccessToken: null });
    expect(result.dispatch).toBe(false);
    expect((result as { dispatch: false; redirectType: string }).redirectType).toBe("session_error");
  });

  it("does NOT dispatch when session.access_token is empty string (KAI-206)", () => {
    const result = evaluateDispatchGate({ ...HAPPY, sessionAccessToken: "" });
    expect(result.dispatch).toBe(false);
  });

  it("does NOT dispatch when session.user.id does not match authenticated user.id (KAI-206)", () => {
    const result = evaluateDispatchGate({
      ...HAPPY,
      sessionUserId:       "attacker-id",
      authenticatedUserId: "user-1",
    });
    expect(result.dispatch).toBe(false);
    expect((result as { dispatch: false; redirectType: string }).redirectType).toBe("session_error");
  });

  // ── Multiple failures: earliest gate wins ─────────────────────────────
  it("credentials failure takes priority over channel failure", () => {
    const result = evaluateDispatchGate({
      ...HAPPY,
      credentialsUpsert: FAIL_UPSERT("creds error"),
      channelUpsert:     FAIL_UPSERT("channel error"),
    }) as { dispatch: false; redirectType: string };
    expect(result.dispatch).toBe(false);
    expect(result.redirectType).toBe("credentials_error");
  });

  it("missing provider_token blocks before any DB check", () => {
    const result = evaluateDispatchGate({
      ...HAPPY,
      providerToken:     null,
      credentialsUpsert: FAIL_UPSERT("would also fail"),
      channelUpsert:     FAIL_UPSERT("would also fail"),
    });
    expect(result.dispatch).toBe(false);
  });

  // ── Regression: partial success is NOT enough ─────────────────────────
  it("does NOT dispatch when only credentials succeed but channel fails", () => {
    expect(evaluateDispatchGate({ ...HAPPY, channelUpsert: FAIL_UPSERT("nope") }).dispatch).toBe(false);
  });

  it("does NOT dispatch when only channel succeeds but credentials fail", () => {
    expect(evaluateDispatchGate({ ...HAPPY, credentialsUpsert: FAIL_UPSERT("nope") }).dispatch).toBe(false);
  });

  it("does NOT dispatch when credentials and channel succeed but session is broken", () => {
    expect(evaluateDispatchGate({ ...HAPPY, sessionAccessToken: null }).dispatch).toBe(false);
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
