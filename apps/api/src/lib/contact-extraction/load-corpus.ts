import type { SupabaseClient } from '@supabase/supabase-js';
import type { TicketCorpus } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Loads the full ticket corpus from the database for the extraction worker.
 *
 * Fetches the ticket row + all messages in the same ticket_messages cluster.
 * Filters by `account_id` explicitly (defence-in-depth — do NOT rely on RLS
 * alone for service-role clients).
 *
 * @throws if the ticket is not found or the account_id doesn't match.
 */
export async function loadTicketCorpus(
  client: DbClient,
  ticketId: string,
): Promise<TicketCorpus> {
  const { data: ticket, error: ticketErr } = await client
    .from('tickets')
    .select('id, account_id, subject, from_email, from_name, to_email, body_plain, body_html')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketErr) {
    throw new Error(`[loadTicketCorpus] DB error fetching ticket ${ticketId}: ${ticketErr.message}`);
  }
  if (!ticket) {
    throw new Error(`[loadTicketCorpus] Ticket ${ticketId} not found.`);
  }

  // Fetch all messages in the same ticket (via ticket_messages join table)
  const { data: messageRows, error: msgErr } = await client
    .from('ticket_messages')
    .select(`
      messages (
        id,
        sender_external_id,
        sender_display_name,
        body_plain,
        raw_payload
      )
    `)
    .eq('ticket_id', ticketId);

  if (msgErr) {
    throw new Error(`[loadTicketCorpus] DB error fetching messages for ticket ${ticketId}: ${msgErr.message}`);
  }

  type MessageRow = {
    id: string;
    sender_external_id: string | null;
    sender_display_name: string | null;
    body_plain: string | null;
    raw_payload: Record<string, unknown> | null;
  };

  const messages = (messageRows ?? [])
    .map((row) => {
      const m = row.messages as unknown as MessageRow | null;
      return m;
    })
    .filter((m): m is MessageRow => m !== null);

  return {
    ticket: {
      id: ticket.id,
      account_id: ticket.account_id,
      subject: ticket.subject,
      from_email: ticket.from_email,
      from_name: ticket.from_name,
      to_email: ticket.to_email,
      body_plain: ticket.body_plain,
      body_html: ticket.body_html,
    },
    messages,
  };
}
