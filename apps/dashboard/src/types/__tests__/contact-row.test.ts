import { describe, it, expect } from "vitest";
import { mapDraftContactToRow, mapClientToRow } from "@/types/contact-row";
import type { Database } from "@/types/supabase";
import type { Client } from "@/types";

type DraftRow = Database["public"]["Tables"]["draft_contact"]["Row"];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseDraft: DraftRow = {
  id:              "draft-uuid-1",
  account_id:      "acct-1",
  email:           "alice@example.com",
  phone:           "+15551234567",
  display_name:    "Alice Wonderland",
  organization:    "ACME Corp",
  status:          "proposed",
  origin:          "kairo_created",
  confidence:      0.9,
  evidence_count:  5,
  external_ref:    null,
  external_source: null,
  source_tickets:  ["ticket-1"],
  merged_into_id:  null,
  first_seen_at:   "2026-01-01T00:00:00Z",
  last_seen_at:    "2026-05-01T12:00:00Z",
  confirmed_at:    null,
  confirmed_by:    null,
  metadata:        {},
  created_at:      "2026-01-01T00:00:00Z",
  updated_at:      "2026-05-01T12:00:00Z",
};

const baseClient: Client = {
  id:               "client-uuid-1",
  internalId:       "CLI-001",
  legalId:          "TAX-123",
  name:             "ACME Corp",
  telephone:        "+15559876543",
  authorizedEmails: ["billing@acme.com", "support@acme.com"],
  contactPersons:   [{ name: "Bob Smith", role: "CTO" }],
  plan:             "Enterprise",
  slaLevel:         "Critical",
  ticketCount:      12,
  csatAvg:          4.8,
  lastContactAt:    "2026-04-20T08:00:00Z",
};

// ---------------------------------------------------------------------------
// mapDraftContactToRow
// ---------------------------------------------------------------------------

describe("mapDraftContactToRow", () => {
  it("maps all fields correctly for a full draft row", () => {
    const row = mapDraftContactToRow(baseDraft);
    expect(row.id).toBe("draft:draft-uuid-1");
    expect(row.source).toBe("draft");
    expect(row.status).toBe("proposed");
    expect(row.displayName).toBe("Alice Wonderland");
    expect(row.organization).toBe("ACME Corp");
    expect(row.email).toBe("alice@example.com");
    expect(row.phone).toBe("+15551234567");
    expect(row.ticketCount).toBe(5);
    expect(row.lastSeenAt).toBe("2026-05-01T12:00:00Z");
    expect(row.plan).toBeNull();
    expect(row.slaLevel).toBeNull();
    expect(row.csatAvg).toBeNull();
    expect(row.externalSource).toBeNull();
  });

  it("falls back to email local-part when display_name is null", () => {
    const row = mapDraftContactToRow({ ...baseDraft, display_name: null });
    expect(row.displayName).toBe("alice");
  });

  it("falls back to phone when display_name and email are null", () => {
    const row = mapDraftContactToRow({ ...baseDraft, display_name: null, email: null });
    expect(row.displayName).toBe("+15551234567");
    expect(row.email).toBeNull();
  });

  it("falls back to '—' when all identity fields are null", () => {
    const row = mapDraftContactToRow({ ...baseDraft, display_name: null, email: null, phone: null });
    expect(row.displayName).toBe("—");
  });

  it("maps confirmed status correctly", () => {
    const row = mapDraftContactToRow({ ...baseDraft, status: "confirmed" });
    expect(row.status).toBe("confirmed");
  });

  it("maps rejected status correctly", () => {
    const row = mapDraftContactToRow({ ...baseDraft, status: "rejected" });
    expect(row.status).toBe("rejected");
  });

  it("maps external_source for external_synced origin", () => {
    const row = mapDraftContactToRow({
      ...baseDraft,
      origin: "external_synced",
      external_source: "Hubspot",
    });
    expect(row.externalSource).toBe("Hubspot");
  });

  it("is idempotent — mapping twice yields the same result", () => {
    const r1 = mapDraftContactToRow(baseDraft);
    const r2 = mapDraftContactToRow(baseDraft);
    expect(r1).toEqual(r2);
  });
});

// ---------------------------------------------------------------------------
// mapClientToRow
// ---------------------------------------------------------------------------

describe("mapClientToRow", () => {
  it("maps all fields correctly for a full client", () => {
    const row = mapClientToRow(baseClient);
    expect(row.id).toBe("client:client-uuid-1");
    expect(row.source).toBe("client");
    expect(row.status).toBe("confirmed");
    expect(row.displayName).toBe("ACME Corp");
    expect(row.organization).toBeNull();
    expect(row.email).toBe("billing@acme.com");
    expect(row.phone).toBe("+15559876543");
    expect(row.ticketCount).toBe(12);
    expect(row.lastSeenAt).toBe("2026-04-20T08:00:00Z");
    expect(row.plan).toBe("Enterprise");
    expect(row.slaLevel).toBe("Critical");
    expect(row.csatAvg).toBe(4.8);
    expect(row.externalSource).toBeNull();
  });

  it("maps client with null plan and slaLevel", () => {
    const row = mapClientToRow({ ...baseClient, plan: null, slaLevel: null, csatAvg: null });
    expect(row.plan).toBeNull();
    expect(row.slaLevel).toBeNull();
    expect(row.csatAvg).toBeNull();
  });

  it("uses first authorized email only", () => {
    const row = mapClientToRow({ ...baseClient, authorizedEmails: ["first@acme.com", "second@acme.com"] });
    expect(row.email).toBe("first@acme.com");
  });

  it("maps email to null when authorizedEmails is empty", () => {
    const row = mapClientToRow({ ...baseClient, authorizedEmails: [] });
    expect(row.email).toBeNull();
  });

  it("is idempotent — mapping twice yields the same result", () => {
    const r1 = mapClientToRow(baseClient);
    const r2 = mapClientToRow(baseClient);
    expect(r1).toEqual(r2);
  });
});
