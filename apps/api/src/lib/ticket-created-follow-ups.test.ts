import { describe, it, expect, mock } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

process.env.SKIP_ENV_VALIDATION ??= "1";

// The module graph reads the lib/supabase.js singleton at import time; stubbing it
// keeps this file independent of the environment (see tickets.status.test.ts).
mock.module("./supabase.js", () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: null, error: null }) } }));

const { runTicketCreatedFollowUps, describeTicketFollowUps, TICKET_CREATION_FLOWS, TICKET_FOLLOW_UPS } = await import("./ticket-created-follow-ups.js");

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const TICKET_ID = "00000000-0000-4000-8000-000000000002";

function baseContext(overrides: Record<string, unknown> = {}) {
  const rpc = mock(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null }));
  const context = {
    supabase: { rpc } as never,
    accountId: ACCOUNT_ID,
    ticketId: TICKET_ID,
    source: "tier1" as const,
    ticketNumber: 12,
    conversationId: null,
    channelIntegrationId: null,
    gmailThreadId: "thread-1",
    gmailMessageId: "message-1",
    messageIdHeader: null,
    subject: "Help",
    fromHeader: "Ana <ana@outside.com>",
    customerDisplayName: null,
    category: "billing",
    // Old enough that neither automatic reply may be sent.
    receivedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
  return { context, rpc };
}

describe("runTicketCreatedFollowUps", () => {
  it("asks for the semantic index of the new ticket", async () => {
    const { context, rpc } = baseContext();
    await runTicketCreatedFollowUps(context);
    const requests = rpc.mock.calls.filter(([name]) => name === "semantic_source");
    expect(requests).toHaveLength(1);
    expect(requests[0]![1]).toMatchObject({ p_account_id: ACCOUNT_ID, p_kind: "ticket", p_id: TICKET_ID });
  });

  it("resolves without sending anything for an email older than the freshness window", async () => {
    const { context } = baseContext();
    await expect(runTicketCreatedFollowUps(context)).resolves.toBeUndefined();
  });
});

describe("follow-up applicability table", () => {
  it("states a decision for every activity in every flow, with a reason for each skip", () => {
    const rows = describeTicketFollowUps();
    expect(rows.map((row) => row.followUp)).toEqual([...TICKET_FOLLOW_UPS]);
    for (const row of rows) {
      expect(Object.keys(row.flows).sort()).toEqual([...TICKET_CREATION_FLOWS].sort());
      for (const decision of Object.values(row.flows)) {
        if (decision !== true) expect(decision.skip.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// Every place that creates a ticket must run the follow-ups, so a new flow
// cannot skip them. The creator itself and the tests are exempt.
describe("ticket creation flows", () => {
  const root = join(import.meta.dir, "..");
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts") && !/\.test\.|\.integration\./.test(path)) sources.push(path);
    }
  };
  walk(root);

  const createsTickets = (text: string) =>
    /findOrCreateTicketForThread\(/.test(text) || /\.from\(["']tickets["']\)\s*\.insert\(/.test(text);

  it("every flow that creates a ticket runs the follow-ups", () => {
    const missing = sources
      .filter((path) => !path.endsWith(join("lib", "tickets-by-thread.ts")))
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        return createsTickets(text) && !/runTicketCreatedFollowUps|ticketCreatedFollowUps/.test(text);
      })
      .map((path) => relative(root, path));
    expect(missing).toEqual([]);
  });

  it("every declared flow has a call site, and every call site names a declared flow", () => {
    const used = new Set<string>();
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      if (!/runTicketCreatedFollowUps|ticketCreatedFollowUps/.test(text)) continue;
      for (const match of text.matchAll(/source: "([a-z0-9-]+)"/g)) used.add(match[1]!);
    }
    for (const flow of TICKET_CREATION_FLOWS) expect(used.has(flow)).toBe(true);
  });

  it("finds the flows it is meant to guard", () => {
    const guarded = sources.filter((path) => createsTickets(readFileSync(path, "utf8")));
    expect(guarded.length).toBeGreaterThanOrEqual(6);
  });
});
