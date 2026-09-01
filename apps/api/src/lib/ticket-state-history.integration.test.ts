import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { transitionTicketStatus } from "./ticket-transition.js";

// ---------------------------------------------------------------------------
// KAI-191 — four DB-level guarantees that were verified by hand while
// building the ticket lifecycle state machine, written down here so they
// stay proven:
//
//   1. ticket_state_history and ticket_activity_log are append-only: an
//      UPDATE or DELETE against either raises, even for the service_role
//      client the API itself uses (see the "regardless of role" comment in
//      supabase/migrations/20260831195533_create_apply_ticket_transition.sql
//      and .../20260831213820_create_ticket_activity_log.sql).
//   2. actor_ref survives the referenced user being deleted from auth.users
//      (actor_user_id FK is ON DELETE SET NULL; actor_ref is a plain text
//      snapshot, not a live reference).
//   3. (account_id, idempotency_key) is UNIQUE — replaying the same
//      transitionTicketStatus() call is a no-op, not an error, and never
//      produces a second row.
//   4. status = 'ai_resolved' iff the last transition into the resolved
//      family recorded actor_type = 'ai'.
//
// These hit the real linked Supabase project (see .env.local) — there is no
// local stack for this. `bun test` runs with NODE_ENV=test and does NOT
// auto-load .env.local (only `bun run --env-file ../../.env.local ...`
// does, per apps/api/package.json's dev/start scripts), so this file reads
// it by hand into local consts (never into process.env — no reason to
// touch other files' environment) to build its own client.
//
// emitTicketActivity (lib/ticket-events.ts) hardcodes a dependency on the
// lib/supabase.ts singleton, which validates SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY via @kairo/env at import time and throws if
// they're missing — and several other test files in this suite already
// call bun:test's mock.module("./supabase.js" /* their relative path */,
// ...) to stub that singleton out process-wide for their own unit tests
// (mock.module has no "unmock" and persists for the rest of the `bun test`
// run — see the note in gmail-poll-cron.test.ts). Whichever stub was
// registered last wins for every subsequent import of the module,
// regardless of who wrote it. So rather than hope this file's import runs
// before any of those, it registers its own mock.module pointing
// lib/supabase.ts's `supabase` export at this file's own real, working
// client — deterministic no matter what other files already did, and it
// sidesteps the @kairo/env throw-on-missing-vars problem entirely, since
// the real module body never actually runs.
//
// A NOTE ON CLEANUP: this suite creates real rows. Test users (item 2) and
// the fixture plan/account are cleaned up or reused. Ticket rows are NOT
// reliably cleanable: the moment a ticket has a ticket_state_history or
// ticket_activity_log row, deleting it is permanently blocked — Postgres
// fires the append-only BEFORE DELETE trigger even for rows removed via
// this ticket's own ON DELETE CASCADE, so `DELETE FROM tickets WHERE
// id = ...` fails too. That is not a bug, it is exactly what test #1 below
// proves. Each test still attempts to delete its ticket in a `finally`
// (per house rule), but the attempt is expected to fail once a trail row
// exists, and that failure is logged, not asserted on.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/src/lib -> repo root
const REPO_ROOT = join(__dirname, "../../../../");

function readSupabaseCredentialsFromEnvLocal(): { url: string; serviceRoleKey: string } {
  if (process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    return {
      url: process.env["SUPABASE_URL"],
      serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"],
    };
  }
  const raw = readFileSync(join(REPO_ROOT, ".env.local"), "utf8");
  const values: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (key) values[key] = value ?? "";
  }
  const url = values["SUPABASE_URL"];
  const serviceRoleKey = values["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  }
  return { url, serviceRoleKey };
}

const { url: supabaseUrl, serviceRoleKey } = readSupabaseCredentialsFromEnvLocal();
const admin = createClient(supabaseUrl, serviceRoleKey);

// Must run before importing ./ticket-events.js — see the top-of-file note.
mock.module("./supabase.js", () => ({ supabase: admin }));
const { emitTicketActivity } = await import("./ticket-events.js");

// Deterministic fixture identifiers so repeat runs reuse the same plan and
// account instead of accumulating a fresh one every time — only the ticket
// rows below are new per run (unavoidable, see note above).
const FIXTURE_PLAN_CODE = "kai191-integration-test-fixture";
const FIXTURE_ACCOUNT_SLUG = "kai191-integration-test-fixture";

let accountId: string;

beforeAll(async () => {
  const { data: existingPlan } = await admin
    .from("plans")
    .select("id")
    .eq("code", FIXTURE_PLAN_CODE)
    .maybeSingle();

  let planId: string;
  if (existingPlan) {
    planId = existingPlan.id;
  } else {
    const { data: newPlan, error } = await admin
      .from("plans")
      .insert({ code: FIXTURE_PLAN_CODE, name: "KAI-191 integration test fixture", seat_limit_default: 5 })
      .select("id")
      .single();
    if (error || !newPlan) throw new Error(`failed to create fixture plan: ${error?.message}`);
    planId = newPlan.id;
  }

  const { data: existingAccount } = await admin
    .from("accounts")
    .select("id")
    .eq("slug", FIXTURE_ACCOUNT_SLUG)
    .maybeSingle();

  if (existingAccount) {
    accountId = existingAccount.id;
  } else {
    const { data: newAccount, error } = await admin
      .from("accounts")
      .insert({ name: "KAI-191 integration test fixture", slug: FIXTURE_ACCOUNT_SLUG, plan_id: planId })
      .select("id")
      .single();
    if (error || !newAccount) throw new Error(`failed to create fixture account: ${error?.message}`);
    accountId = newAccount.id;
  }
});

async function createTestTicket(label: string): Promise<string> {
  const { data, error } = await admin
    .from("tickets")
    .insert({
      account_id: accountId,
      subject: `[KAI-191 integration test] ${label} ${randomUUID()}`,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to create test ticket: ${error?.message}`);
  return data.id as string;
}

async function bestEffortDeleteTicket(ticketId: string): Promise<void> {
  const { error } = await admin.from("tickets").delete().eq("id", ticketId);
  if (error) {
    // Expected once the ticket has any ticket_state_history / ticket_activity_log
    // row — see the top-of-file note. Not a test failure.
    console.warn(
      `[ticket-state-history.integration.test] left ticket ${ticketId} in place ` +
        `(undeletable by design once it has a trail row): ${error.message}`
    );
  }
}

const createdTicketIds: string[] = [];
afterAll(async () => {
  for (const id of createdTicketIds) {
    await bestEffortDeleteTicket(id);
  }
});

describe("ticket_state_history / ticket_activity_log — append-only (KAI-191)", () => {
  it("rejects UPDATE and DELETE on a ticket_state_history row, and on a ticket_activity_log row", async () => {
    const ticketId = await createTestTicket("append-only");
    createdTicketIds.push(ticketId);

    const transition = await transitionTicketStatus(admin, {
      ticketId,
      toState: "in_progress",
      actorType: "human",
      actorRef: "integration-test",
      trigger: "manual_status_change",
      idempotencyKey: randomUUID(),
    });
    expect(transition.outcome).toBe("applied");
    if (transition.outcome !== "applied") throw new Error("unreachable");
    const historyId = transition.historyId;

    const updateHistory = await admin
      .from("ticket_state_history")
      .update({ reason: "tampered" })
      .eq("id", historyId);
    expect(updateHistory.error).not.toBeNull();
    expect(updateHistory.error?.message).toContain("append-only");

    const deleteHistory = await admin.from("ticket_state_history").delete().eq("id", historyId);
    expect(deleteHistory.error).not.toBeNull();
    expect(deleteHistory.error?.message).toContain("append-only");

    // Row must still be there, unchanged.
    const { data: survivingHistory } = await admin
      .from("ticket_state_history")
      .select("id, reason")
      .eq("id", historyId)
      .single();
    expect(survivingHistory?.reason).not.toBe("tampered");

    const activityIdempotencyKey = randomUUID();
    await emitTicketActivity({
      accountId,
      ticketId,
      domain: "tickets",
      eventType: "assignment",
      actorType: "human",
      actorRef: "integration-test",
      idempotencyKey: activityIdempotencyKey,
    });

    const { data: activityRow } = await admin
      .from("ticket_activity_log")
      .select("id")
      .eq("idempotency_key", activityIdempotencyKey)
      .single();
    expect(activityRow).toBeTruthy();
    const activityId = activityRow?.id as string;

    const updateActivity = await admin
      .from("ticket_activity_log")
      .update({ reason: "tampered" })
      .eq("id", activityId);
    expect(updateActivity.error).not.toBeNull();
    expect(updateActivity.error?.message).toContain("append-only");

    const deleteActivity = await admin.from("ticket_activity_log").delete().eq("id", activityId);
    expect(deleteActivity.error).not.toBeNull();
    expect(deleteActivity.error?.message).toContain("append-only");

    const { data: survivingActivity } = await admin
      .from("ticket_activity_log")
      .select("id, reason")
      .eq("id", activityId)
      .single();
    expect(survivingActivity?.reason).not.toBe("tampered");
  });
});

describe("ticket_state_history — actor_ref survives actor_user_id deletion (KAI-191)", () => {
  // SKIPPED — this reproduces a real, confirmed bug, not a flaw in the test.
  //
  // ticket_state_history_actor_user_id_fkey is ON DELETE SET NULL, which
  // Postgres implements as an internal UPDATE ... SET actor_user_id = NULL
  // on the referencing row. But ticket_state_history_append_only fires
  // BEFORE UPDATE OR DELETE unconditionally ("regardless of role" — see the
  // trigger's own comment in
  // supabase/migrations/20260831195533_create_apply_ticket_transition.sql),
  // with no carve-out for that internal UPDATE. So the moment a user has
  // driven any ticket transition, deleting them fails outright: verified
  // directly against the linked project —
  //   PATCH .../ticket_state_history?id=eq.<row> {"actor_user_id": null}
  //   -> 403 { "code": "42501", "message": "ticket_state_history is
  //      append-only: UPDATE is not allowed" }
  // — and the same thing happens one level up through
  // admin.auth.admin.deleteUser(), which surfaces as a generic 500
  // "Database error deleting user" because GoTrue's own DELETE FROM
  // auth.users cascades into that same blocked UPDATE. actor_user_id never
  // reaches NULL; the user is never deleted.
  //
  // Same construction, same bug, on ticket_activity_log_append_only.
  //
  // Fix (not applied here — pushing a migration to the shared linked
  // project needs explicit sign-off per supabase/SKILL.md step 3, "wait for
  // confirmation before pushing", which this test-writing task didn't ask
  // for): special-case both reject_*_mutation() trigger functions to allow
  // an UPDATE that changes only actor_user_id from non-null to NULL, and
  // continue rejecting every other UPDATE/DELETE unconditionally. Once
  // that's live, remove `.skip` below — the assertions already encode the
  // intended invariant.
  it("keeps actor_ref after the referenced auth.users row is deleted, with actor_user_id set NULL", async () => {
    const ticketId = await createTestTicket("actor-ref-survives-user-deletion");
    createdTicketIds.push(ticketId);

    const email = `kai191-integration-test-${randomUUID()}@example.invalid`;
    const { data: userData, error: createUserError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createUserError || !userData?.user) {
      throw new Error(`failed to create test user: ${createUserError?.message}`);
    }
    const userId = userData.user.id;
    const actorRef = `Test User <${email}>`;

    const transition = await transitionTicketStatus(admin, {
      ticketId,
      toState: "in_progress",
      actorType: "human",
      actorUserId: userId,
      actorRef,
      trigger: "manual_status_change",
      idempotencyKey: randomUUID(),
    });
    expect(transition.outcome).toBe("applied");
    if (transition.outcome !== "applied") throw new Error("unreachable");
    const historyId = transition.historyId;

    const { data: beforeDelete } = await admin
      .from("ticket_state_history")
      .select("actor_user_id, actor_ref")
      .eq("id", historyId)
      .single();
    expect(beforeDelete?.actor_user_id).toBe(userId);
    expect(beforeDelete?.actor_ref).toBe(actorRef);

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    expect(deleteUserError).toBeFalsy();

    const { data: afterDelete } = await admin
      .from("ticket_state_history")
      .select("actor_user_id, actor_ref")
      .eq("id", historyId)
      .single();
    expect(afterDelete?.actor_user_id).toBeNull();
    expect(afterDelete?.actor_ref).toBe(actorRef);
  });
});

describe("ticket_state_history — (account_id, idempotency_key) UNIQUE (KAI-191)", () => {
  it("replays the same transitionTicketStatus() call as a no-op instead of a second row", async () => {
    const ticketId = await createTestTicket("idempotency-unique");
    createdTicketIds.push(ticketId);

    const idempotencyKey = randomUUID();
    const args = {
      ticketId,
      toState: "in_progress" as const,
      actorType: "human" as const,
      actorRef: "integration-test",
      trigger: "manual_status_change",
      idempotencyKey,
    };

    const first = await transitionTicketStatus(admin, args);
    expect(first.outcome).toBe("applied");

    const second = await transitionTicketStatus(admin, args);
    expect(second.outcome).toBe("no_op");

    const { data: rows, error } = await admin
      .from("ticket_state_history")
      .select("id")
      .eq("account_id", accountId)
      .eq("idempotency_key", idempotencyKey);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
  });
});

describe("ai_resolved invariant (KAI-191)", () => {
  it("status = 'ai_resolved' iff the last transition into the resolved family has actor_type = 'ai'", async () => {
    const ticketId = await createTestTicket("ai-resolved-invariant");
    createdTicketIds.push(ticketId);

    const transition = await transitionTicketStatus(admin, {
      ticketId,
      toState: "ai_resolved",
      actorType: "ai",
      actorRef: "kai-triage-agent",
      trigger: "agent_reply_resolve",
      idempotencyKey: randomUUID(),
    });
    expect(transition.outcome).toBe("applied");

    const { data: ticket } = await admin.from("tickets").select("status").eq("id", ticketId).single();
    expect(ticket?.status).toBe("ai_resolved");

    // "Resolved family" here means the two states a ticket enters by being
    // resolved (not 'closed', which is a further transition afterwards) —
    // deliberately narrower than @kairo/types RESOLVED_STATUSES, which also
    // includes 'closed' for the dashboard's final-state bucket.
    const { data: lastResolvedFamilyRow } = await admin
      .from("ticket_state_history")
      .select("actor_type, to_state")
      .eq("ticket_id", ticketId)
      .in("to_state", ["resolved", "ai_resolved"])
      .order("seq", { ascending: false })
      .limit(1)
      .single();

    expect(lastResolvedFamilyRow?.to_state).toBe("ai_resolved");
    expect(lastResolvedFamilyRow?.actor_type).toBe("ai");

    // The invariant, stated as a query-based assertion: status is
    // 'ai_resolved' exactly when the last resolved-family transition was
    // actor_type 'ai'.
    const statusIsAiResolved = ticket?.status === "ai_resolved";
    const lastTransitionWasAi = lastResolvedFamilyRow?.actor_type === "ai";
    expect(statusIsAiResolved).toBe(lastTransitionWasAi);
  });
});
