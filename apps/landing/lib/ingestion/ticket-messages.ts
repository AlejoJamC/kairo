/**
 * Duplicate of apps/api/src/lib/ticket-messages.ts for use in the Next.js landing app.
 * NOTE: Keep in sync with the canonical version in apps/api/src/lib/ticket-messages.ts.
 * Reason: apps/api is a Bun server — its lib cannot be imported by Next.js directly
 * without creating a new shared package (out of scope per KAI-165 plan decision #6).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

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
    console.error(
      `[ticket-messages] linkMessageToTicket failed ticket=${args.ticket_id} message=${args.message_id}:`,
      error.message
    );
  }
}
