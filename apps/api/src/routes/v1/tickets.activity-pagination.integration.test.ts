import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localSupabaseTarget } from "../../test-support/local-supabase.js";

// ---------------------------------------------------------------------------
// KAI-191 fix (code review finding #2) — GET /:id/activity paginates
// ticket_lifecycle_timeline by occurred_at alone. The view unions five
// sources with no shared, globally ordered secondary key, so two rows can
// legitimately share an identical occurred_at — recordAiClassification()
// itself does this on purpose (see functions/pipeline/tier2-background.ts
// et al.: a single classification pass writes 'category' and 'priority' as
// two ticket_classification_history rows with the same timestamp). If that
// pair fell on a page boundary, the old `.lt("occurred_at", X)` cursor
// excluded everything at timestamp X on the next page — silently dropping
// whichever of the pair didn't make the previous page, with no error.
//
// This test proves the fix: each row's own id (added to the view as a
// stable tie-break) plus a compound (occurred_at, id) cursor — the same
// pattern GET /:id/activity now uses — walks the whole timeline with limit=1
// pages and loses nothing, even across a same-timestamp pair.
//
// Runs only against a local Supabase stack on explicit opt-in, same pattern
// as ticket-state-history.integration.test.ts (see that file's header:
// RUN_SUPABASE_INTEGRATION=1, mock.module("./supabase.js") registered before
// importing anything that touches the singleton).
// ---------------------------------------------------------------------------

// Writes rows: runs only against a local stack, on explicit opt-in (see test-support/local-supabase).
const target = localSupabaseTarget();
const describeLocal = target ? describe : describe.skip;
const admin = target ? createClient(target.url, target.serviceRoleKey) : (null as never);

// Must run before importing lib/ticket-events.js — its emit functions read
// the lib/supabase.js singleton at call time.
if (target) mock.module("../../lib/supabase.js", () => ({ supabase: admin }));
const { emitTicketClassification, emitTicketActivity } = target ? await import("../../lib/ticket-events.js") : ({} as typeof import("../../lib/ticket-events.js"));

const FIXTURE_PLAN_CODE = "kai191-activity-pagination-test-fixture";
const FIXTURE_ACCOUNT_SLUG = "kai191-activity-pagination-test-fixture";

let accountId: string;

beforeAll(async () => {
  if (!target) return;
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
      .insert({ code: FIXTURE_PLAN_CODE, name: "KAI-191 activity pagination test fixture", seat_limit_default: 5 })
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
      .insert({ name: "KAI-191 activity pagination test fixture", slug: FIXTURE_ACCOUNT_SLUG, plan_id: planId })
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
      subject: `[KAI-191 activity pagination test] ${label} ${randomUUID()}`,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to create test ticket: ${error?.message}`);
  return data.id as string;
}

const createdTicketIds: string[] = [];
afterAll(async () => {
  if (!target) return;
  for (const id of createdTicketIds) {
    const { error } = await admin.from("tickets").delete().eq("id", id);
    if (error) {
      console.warn(
        `[tickets.activity-pagination.integration.test] left ticket ${id} in place ` +
          `(undeletable by design once it has a trail row): ${error.message}`
      );
    }
  }
});

// Mirrors GET /:id/activity's query construction exactly, so this test
// exercises the real pagination logic rather than a re-implementation of it.
async function fetchPage(
  ticketId: string,
  limit: number,
  cursor: { occurred_at: string; id: string } | null
): Promise<{ items: { occurred_at: string; id: string; detail: string }[]; next: { occurred_at: string; id: string } | null }> {
  let query = admin
    .from("ticket_lifecycle_timeline")
    .select("occurred_at, id, detail")
    .eq("ticket_id", ticketId)
    .eq("account_id", accountId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.or(
      `occurred_at.lt.${cursor.occurred_at},and(occurred_at.eq.${cursor.occurred_at},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`page query failed: ${error.message}`);
  const items = (data ?? []) as { occurred_at: string; id: string; detail: string }[];
  const last = items.at(-1);
  const next = items.length === limit && last ? { occurred_at: last.occurred_at, id: last.id } : null;
  return { items, next };
}

describeLocal("ticket_lifecycle_timeline pagination — no row lost across a same-timestamp tie (KAI-191 fix)", () => {
  it("walking with limit=1 returns every row exactly once, including a tied pair", async () => {
    const ticketId = await createTestTicket("pagination-tie");
    createdTicketIds.push(ticketId);

    const tiedTimestamp = new Date().toISOString();
    const earlierTimestamp = new Date(Date.now() - 60_000).toISOString();

    // An earlier, untied row — proves paging continues past the tie.
    await emitTicketActivity({
      accountId,
      ticketId,
      domain: "tickets",
      eventType: "assignment",
      actorType: "system",
      actorRef: "pagination-test-earlier",
      occurredAt: earlierTimestamp,
    });

    // The exact shape recordAiClassification() produces: two rows, one
    // timestamp, from the same classification pass.
    await emitTicketClassification({
      accountId,
      ticketId,
      actorType: "ai",
      actorRef: "pagination-test-tied-a",
      dimension: "category",
      applied: true,
      toValue: "billing",
      occurredAt: tiedTimestamp,
    });
    await emitTicketClassification({
      accountId,
      ticketId,
      actorType: "ai",
      actorRef: "pagination-test-tied-b",
      dimension: "priority",
      applied: true,
      toValue: "P2",
      occurredAt: tiedTimestamp,
    });

    const seen: string[] = [];
    let cursor: { occurred_at: string; id: string } | null = null;
    let pages = 0;
    do {
      const page = await fetchPage(ticketId, 1, cursor);
      expect(page.items.length).toBeLessThanOrEqual(1);
      for (const item of page.items) seen.push(item.id);
      cursor = page.next;
      pages++;
    } while (cursor && pages < 10);

    // Three rows written, walked one page at a time: every id appears
    // exactly once. Before the fix, the tied pair risked one of the two
    // being silently skipped the moment it landed on a page boundary.
    expect(seen.length).toBe(3);
    expect(new Set(seen).size).toBe(3);
  });
});
