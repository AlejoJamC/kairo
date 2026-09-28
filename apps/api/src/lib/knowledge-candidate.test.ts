import { describe, it, expect, mock } from "bun:test";

import type { KnowledgeDecision } from "@kairo/intelligence";
import type { KnowledgeCandidateDeps } from "./knowledge-candidate";

// The module under test reads the app env at import time; every collaborator
// that would use it is injected below, so placeholder values are enough.
process.env["SUPABASE_URL"] ??= "http://localhost:54321";
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "test-service-role-key";
const { draftKnowledgeFromTicket } = await import("./knowledge-candidate");

const CANDIDATE: KnowledgeDecision = {
  isKnowledgeCandidate: true,
  knowledgeType: "resolution",
  reusableAcrossCustomers: true,
  evidenceQuality: "high",
  confidence: 0.9,
};

interface FakeOptions {
  ticket?: Record<string, unknown> | null;
  existingDraft?: boolean;
  messages?: { direction: string; body_plain: string; received_at: string }[];
}

function fakeDb(options: FakeOptions = {}) {
  const inserted: Record<string, unknown>[] = [];
  const ticket = options.ticket === undefined
    ? { id: "t-1", subject: "Cannot export", category: "technical", ticket_type: "support", conversation_id: "c-1" }
    : options.ticket;
  const messages = options.messages ?? [
    { direction: "inbound", body_plain: "The export button does nothing.", received_at: "x" },
    { direction: "outbound", body_plain: "Clear the cache and retry, it fixes it.", received_at: "y" },
  ];

  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain["select"] = self;
      chain["eq"] = self;
      chain["order"] = self;
      chain["contains"] = self;
      if (table === "tickets") {
        chain["single"] = async () => ({ data: ticket });
      } else if (table === "kb_articles") {
        chain["limit"] = async () => ({ data: options.existingDraft ? [{ id: "kb-0" }] : [] });
        chain["insert"] = (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "kb-1" }, error: null }) }) };
        };
      } else if (table === "messages") {
        chain["limit"] = () => Promise.resolve({ data: messages });
        (chain["limit"] as unknown) = () => ({ then: (r: (v: { data: unknown }) => unknown) => r({ data: messages }) });
      }
      return chain;
    },
  };
  return { db: db as unknown as KnowledgeCandidateDeps["supabase"], inserted };
}

function deps(over: Partial<KnowledgeCandidateDeps> & { db: KnowledgeCandidateDeps["supabase"] }): KnowledgeCandidateDeps {
  return {
    supabase: over.db,
    resolveLanguage: async () => "en",
    decide: over.decide ?? (async () => CANDIDATE),
    draft: over.draft ?? (async () => ({ title: "Export button does nothing", content: "Clear the cache and retry." })),
    embed: over.embed ?? (async () => ({ status: "ok" as const })),
  };
}

describe("draftKnowledgeFromTicket", () => {
  it("stores an unpublished, tagged draft when JEV says the ticket is a candidate", async () => {
    const { db, inserted } = fakeDb();
    const outcome = await draftKnowledgeFromTicket({ ticketId: "t-1", accountId: "a-1" }, deps({ db }));

    expect(outcome).toEqual({ status: "drafted", articleId: "kb-1", decision: CANDIDATE });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      account_id: "a-1",
      title: "Export button does nothing",
      is_published: false,
    });
    expect(inserted[0]!["tags"]).toEqual(["ai-draft", "type:resolution", "ticket:t-1", "reusable"]);
  });

  it("does not call the text model when JEV says it is not a candidate", async () => {
    const { db, inserted } = fakeDb();
    const draft = mock(async () => ({ title: "x", content: "y" }));
    const outcome = await draftKnowledgeFromTicket(
      { ticketId: "t-1", accountId: "a-1" },
      deps({ db, decide: async () => ({ ...CANDIDATE, isKnowledgeCandidate: false }), draft }),
    );

    expect(outcome).toEqual({ status: "skipped", reason: "not_candidate" });
    expect(draft).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("skips a ticket that already has a draft, without asking JEV", async () => {
    const { db } = fakeDb({ existingDraft: true });
    const decide = mock(async () => CANDIDATE);
    const outcome = await draftKnowledgeFromTicket({ ticketId: "t-1", accountId: "a-1" }, deps({ db, decide }));

    expect(outcome).toEqual({ status: "skipped", reason: "already_drafted" });
    expect(decide).not.toHaveBeenCalled();
  });

  it("skips a ticket that is not found for the account", async () => {
    const { db } = fakeDb({ ticket: null });
    const outcome = await draftKnowledgeFromTicket({ ticketId: "t-1", accountId: "a-1" }, deps({ db }));
    expect(outcome).toEqual({ status: "skipped", reason: "ticket_not_found" });
  });

  it("skips a ticket whose thread has no text", async () => {
    const { db } = fakeDb({ messages: [] });
    const outcome = await draftKnowledgeFromTicket({ ticketId: "t-1", accountId: "a-1" }, deps({ db }));
    expect(outcome).toEqual({ status: "skipped", reason: "no_thread" });
  });
});
