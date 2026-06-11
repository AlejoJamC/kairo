import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Link a message to a ticket via the ticket_messages join table.
 * Idempotent: ON CONFLICT (ticket_id, message_id) DO NOTHING.
 *
 * ticket_messages_pkey is (ticket_id, message_id) — cannot be duplicated.
 */
export async function linkMessageToTicket(
  client: DbClient,
  args: { ticket_id: string; message_id: string; is_origin: boolean }
): Promise<void> {
  const { error } = await client.from("ticket_messages").upsert(
    {
      ticket_id: args.ticket_id,
      message_id: args.message_id,
      is_origin: args.is_origin,
    },
    { onConflict: "ticket_id,message_id", ignoreDuplicates: true }
  );

  if (error) {
    // Non-fatal: log but do not block the primary ingestion path
    console.error(
      `[ticket-messages] linkMessageToTicket failed ticket=${args.ticket_id} message=${args.message_id}:`,
      error.message
    );
  }
}

/** Count messages currently linked to a ticket via ticket_messages. */
export async function countTicketMessages(client: DbClient, ticketId: string): Promise<number> {
  const { count } = await client
    .from("ticket_messages")
    .select("*", { count: "exact", head: true })
    .eq("ticket_id", ticketId);

  return count ?? 0;
}
