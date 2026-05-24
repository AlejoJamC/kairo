import type { Client } from "@/types";
import type { Database } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Unified contact model for the client directory UI (KAI-227)
// Normalizes draft_contact (Supabase) + clients (BFF API) into a single shape.
// ---------------------------------------------------------------------------

export type ContactRowStatus = "proposed" | "confirmed" | "rejected";
export type ContactRowSource = "draft" | "client";

export interface ContactRow {
  // Identity — prefixed to avoid collisions between tables
  // Format: 'draft:<uuid>' | 'client:<uuid>'
  id: string;
  source: ContactRowSource;
  status: ContactRowStatus;

  // Display fields
  displayName: string;
  organization: string | null;
  email: string | null;
  phone: string | null;

  // Evidence
  ticketCount: number;
  lastSeenAt: string | null;

  // Only meaningful for source='client'
  plan: string | null;
  slaLevel: string | null;
  csatAvg: number | null;

  // Only meaningful for source='draft' with origin='external_synced'
  externalSource: string | null;
}

// ---------------------------------------------------------------------------
// Raw draft_contact row (selected fields)
// ---------------------------------------------------------------------------

type DraftContactRow = Database["public"]["Tables"]["draft_contact"]["Row"];

export function mapDraftContactToRow(row: DraftContactRow): ContactRow {
  // Derive displayName fallback chain per spec
  const emailLocalPart = row.email ? row.email.split("@")[0] : null;
  const displayName =
    row.display_name ??
    emailLocalPart ??
    row.phone ??
    "—";

  // Map draft status to ContactRowStatus (ignore 'merged_into' — those are hidden)
  const status: ContactRowStatus =
    row.status === "confirmed"
      ? "confirmed"
      : row.status === "rejected"
      ? "rejected"
      : "proposed";

  return {
    id: `draft:${row.id}`,
    source: "draft",
    status,
    displayName,
    organization: row.organization ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    ticketCount: row.evidence_count,
    lastSeenAt: row.last_seen_at ?? null,
    plan: null,
    slaLevel: null,
    csatAvg: null,
    externalSource: row.external_source ?? null,
  };
}

export function mapClientToRow(client: Client): ContactRow {
  return {
    id: `client:${client.id}`,
    source: "client",
    status: "confirmed",
    displayName: client.name,
    organization: null, // clients table has no organization field
    email: client.authorizedEmails[0] ?? null,
    phone: client.telephone ?? null,
    ticketCount: client.ticketCount,
    lastSeenAt: client.lastContactAt ?? null,
    plan: client.plan ?? null,
    slaLevel: client.slaLevel ?? null,
    csatAvg: client.csatAvg ?? null,
    externalSource: null,
  };
}
