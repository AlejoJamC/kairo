import { describe, it, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// KAI-55 — operational_learning read/write access.
// ---------------------------------------------------------------------------

let lastInsert: Record<string, unknown> | undefined;
let lastUpdate: Record<string, unknown> | undefined;
let eqCalls: Array<[string, unknown]> = [];
let currentResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };

function makeBuilder(): Record<string, unknown> {
  const b: Record<string, unknown> = {
    select: mock(() => b),
    insert: mock((row: Record<string, unknown>) => {
      lastInsert = row;
      return b;
    }),
    update: mock((patch: Record<string, unknown>) => {
      lastUpdate = patch;
      return b;
    }),
    eq: mock((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return b;
    }),
    single: mock(async () => currentResult),
    then: (resolve: (r: typeof currentResult) => void) => resolve(currentResult),
  };
  return b;
}

const fromMock = mock(() => makeBuilder());

mock.module("./supabase.js", () => ({
  supabase: { from: fromMock },
}));

const {
  createOperationalLearning,
  listApprovedLearnings,
  listPendingLearnings,
  reviewOperationalLearning,
} = await import("./operational-learning.js");

beforeEach(() => {
  fromMock.mockClear();
  lastInsert = undefined;
  lastUpdate = undefined;
  eqCalls = [];
  currentResult = { data: null, error: null };
});

describe("createOperationalLearning", () => {
  it("a human correction is written already approved", async () => {
    currentResult = { data: { id: "row-1" }, error: null };

    const id = await createOperationalLearning({
      accountId: "acc-1",
      origin: "human_correction",
      learningType: "routing_rule",
      summary: "Billing tickets from acme.com go to finance",
      ticketIds: ["t-1", "t-2"],
      sourceCount: 2,
      confidence: null,
    });

    expect(id).toBe("row-1");
    expect(lastInsert).toMatchObject({
      account_id: "acc-1",
      origin: "human_correction",
      status: "approved",
      learning_type: "routing_rule",
      ticket_ids: ["t-1", "t-2"],
      source_count: 2,
      confidence: null,
    });
  });

  it("a system-derived candidate is written pending review, never approved outright", async () => {
    currentResult = { data: { id: "row-2" }, error: null };

    await createOperationalLearning({
      accountId: "acc-1",
      origin: "system_derived",
      learningType: "diagnostic_pattern",
      summary: "Repeated 500s correlate with a specific integration",
      ticketIds: ["t-3"],
      sourceCount: 5,
      confidence: 0.7,
    });

    expect(lastInsert?.["status"]).toBe("pending_review");
  });

  it("returns null instead of throwing when the insert errors", async () => {
    currentResult = { data: null, error: { message: "insert failed" } };

    const id = await createOperationalLearning({
      accountId: "acc-1",
      origin: "human_correction",
      learningType: "resolution",
      summary: "x",
      ticketIds: [],
      sourceCount: 0,
      confidence: null,
    });

    expect(id).toBeNull();
  });
});

describe("listApprovedLearnings / listPendingLearnings", () => {
  it("filters by account and status, and maps rows to OperationalLearning", async () => {
    currentResult = {
      data: [
        {
          id: "row-1",
          account_id: "acc-1",
          origin: "human_correction",
          status: "approved",
          learning_type: "routing_rule",
          summary: "Billing tickets go to finance",
          ticket_ids: ["t-1"],
          source_count: 1,
          confidence: null,
          reviewed_by: null,
          reviewed_at: null,
        },
      ],
      error: null,
    };

    const result = await listApprovedLearnings("acc-1");

    expect(eqCalls).toEqual([
      ["account_id", "acc-1"],
      ["status", "approved"],
    ]);
    expect(result).toEqual([
      {
        accountId: "acc-1",
        origin: "human_correction",
        status: "approved",
        learningType: "routing_rule",
        summary: "Billing tickets go to finance",
        evidence: { ticketIds: ["t-1"], sourceCount: 1 },
        confidence: null,
      },
    ]);
  });

  it("listPendingLearnings filters on pending_review", async () => {
    currentResult = { data: [], error: null };
    await listPendingLearnings("acc-1");
    expect(eqCalls).toEqual([
      ["account_id", "acc-1"],
      ["status", "pending_review"],
    ]);
  });

  it("returns an empty list instead of throwing when the table is unreadable", async () => {
    currentResult = { data: null, error: { message: "db down" } };
    expect(await listApprovedLearnings("acc-1")).toEqual([]);
  });
});

describe("reviewOperationalLearning", () => {
  it("approves a pending candidate and stamps who reviewed it", async () => {
    currentResult = { data: null, error: null };

    const ok = await reviewOperationalLearning("row-2", "approved", "user-1");

    expect(ok).toBe(true);
    expect(lastUpdate).toMatchObject({ status: "approved", reviewed_by: "user-1" });
    expect(eqCalls[0]).toEqual(["id", "row-2"]);
    expect(eqCalls[1]).toEqual(["status", "pending_review"]);
  });

  it("returns false instead of throwing when the update errors", async () => {
    currentResult = { data: null, error: { message: "db down" } };
    expect(await reviewOperationalLearning("row-2", "rejected", "user-1")).toBe(false);
  });
});
