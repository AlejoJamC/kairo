/**
 * KAI-225 — Contact Extraction Worker — shared types.
 *
 * Only Pasada A (heuristic) fields are represented here.
 * Phone extraction (Pasada B, LLM) is deferred to KAI-238.
 */

/**
 * The full corpus of a ticket used by the extraction worker.
 * Loaded via `loadTicketCorpus` from the database.
 */
export interface TicketCorpus {
  ticket: {
    id: string;
    account_id: string;
    subject: string | null;
    from_email: string | null;
    from_name: string | null;
    to_email: string | null;
    body_plain: string | null;
    body_html: string | null;
  };
  messages: Array<{
    id: string;
    /** Raw `From` header value, e.g. `"Johan Hurtado" <j@example.com>` */
    sender_external_id: string | null;
    sender_display_name: string | null;
    body_plain: string | null;
    /** Full raw payload (JSONB) — may contain `To`, `Cc` headers. */
    raw_payload: Record<string, unknown> | null;
  }>;
}

/**
 * Source of the candidate — which header it was extracted from.
 */
export type CandidateSource =
  | 'from_header'
  | 'cc_header'
  | 'to_header'
  | 'body_header_block';

/**
 * Role of the person relative to the email thread.
 */
export type EvidenceRole = 'sender' | 'recipient' | 'cc';

/**
 * A contact candidate extracted by the heuristic pass.
 */
export interface Candidate {
  /** Normalized email (already via @kairo/identity.normalizeEmail), or null. */
  email: string | null;
  /** Always null in Pasada A — phone extraction is KAI-238 (Pasada B, LLM). */
  phone: null;
  display_name: string | null;
  organization: string | null;
  source: CandidateSource;
  evidence_role: EvidenceRole;
}

/**
 * Aggregated result of one extraction run.
 */
export interface ExtractionResult {
  candidates_count: number;
  excluded_count: number;
  drafts_created: number;
  drafts_updated: number;
}
