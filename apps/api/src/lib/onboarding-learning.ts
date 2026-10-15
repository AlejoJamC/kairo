import type { SupabaseClient } from '@supabase/supabase-js';

export interface SampleLearningSource { ticketId: string; messageId: string }

/** Queue learning from saved initial-sample sources without repeating ingestion. */
export async function enqueueOnboardingLearning(accountId: string, sources: SampleLearningSource[], db: SupabaseClient) {
  let queued = 0;
  for (const source of sources) {
    const [{ data: message, error: messageError }, { data: link, error: linkError }] = await Promise.all([
      db.from('messages').select('id,direction,processing_tier').eq('account_id', accountId).eq('id', source.messageId).maybeSingle(),
      db.from('ticket_messages').select('ticket_id').eq('ticket_id', source.ticketId).eq('message_id', source.messageId).maybeSingle(),
    ]);
    if (messageError || linkError) throw new Error('Initial learning source lookup failed');
    if (!message || !link || message.direction !== 'inbound' || message.processing_tier !== 1) continue;
    const { data: ticket, error: ticketError } = await db.from('tickets').select('id').eq('account_id', accountId).eq('id', source.ticketId).maybeSingle();
    if (ticketError) throw new Error('Initial learning ticket lookup failed');
    if (!ticket) continue;
    const { error } = await db.from('decision_work_items').upsert({ account_id: accountId,
      ticket_id: source.ticketId, message_id: source.messageId, contract: 'historical_learning',
      dedupe_key: `message:${source.messageId}` }, { onConflict: 'account_id,dedupe_key', ignoreDuplicates: true });
    if (error) throw new Error('Initial learning enqueue failed');
    queued++;
  }
  return { eligibleSources: queued };
}
