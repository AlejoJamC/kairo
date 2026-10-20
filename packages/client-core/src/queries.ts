/**
 * Direct Supabase reads and writes used by the clients. Views call these
 * functions instead of building queries, so row access stays in one place.
 */
import type { Ticket } from "@kairo/types";
import { createClient } from "./supabase";
import { INBOX_FETCH_EXCLUDED_STATUSES_FILTER } from "./triage-status";

/**
 * Active inbox tickets, highest priority score first. ADR-022: tickets are
 * scoped by account_id. When accountId is known, filter explicitly; otherwise
 * RLS (current_account_id()) still scopes the query.
 */
export async function fetchInboxTickets(accountId: string | null) {
  let query = createClient()
    .from("tickets")
    .select("*")
    .not("status", "in", INBOX_FETCH_EXCLUDED_STATUSES_FILTER)
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(200);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;
  return { data: (data as Ticket[] | null) ?? null, error };
}

/** One full ticket row, or null when it does not exist. */
export async function fetchTicketById(id: string): Promise<Ticket | null> {
  const { data, error } = await createClient()
    .from("tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return !error && data ? (data as Ticket) : null;
}

/** Classification proposals with their ticket, newest first. */
export async function fetchProposals(status: string) {
  return createClient()
    .from("ticket_proposals")
    .select(
      "id, ticket_id, status, proposed_type, proposed_category, proposed_priority, proposed_sentiment, confidence_score, model_version, created_at, ticket:tickets!inner(*)",
    )
    .eq("status", status)
    .order("created_at", { ascending: false });
}

export async function updateProfileName(profileId: string, name: string) {
  const trimmed = name.trim();
  return createClient()
    .from("profiles")
    .update({ name: trimmed, company_name: trimmed })
    .eq("id", profileId);
}

export async function updatePassword(password: string) {
  return createClient().auth.updateUser({ password });
}

export interface BatchJobStatus {
  status: string;
  processed: number;
  total: number;
}

// batch_classify_jobs is written by the API but is not part of the generated
// database types, so the client is narrowed to the one query shape used here.
interface JobsClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): Promise<{ data: unknown }>;
      };
    };
  };
}

export async function fetchBatchJobStatus(jobId: string): Promise<BatchJobStatus | null> {
  const { data } = await (createClient() as unknown as JobsClient)
    .from("batch_classify_jobs")
    .select("status, processed, total")
    .eq("id", jobId)
    .single();
  return (data as BatchJobStatus | null) ?? null;
}
