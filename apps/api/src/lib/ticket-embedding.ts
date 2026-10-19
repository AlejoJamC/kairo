import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareTicketEmbeddingText, type SemanticFailure, type VectorSpace } from '@kairo/intelligence';
import { createBackendSemanticService } from './semantic-service.js';

export interface MaybeGenerateTicketEmbeddingArgs {
  supabase: SupabaseClient;
  ticketId: string;
  accountId: string;
  subject: string;
  bodyPreview: string;
  embedFn?: (text: string, context?: { ticketId?: string; accountId?: string }) => Promise<number[]>;
  space?: VectorSpace;
}
export type TicketEmbeddingOutcome = { status: 'ok' } | { status: 'skipped'; reason: 'empty_text' } |
  { status: 'failed'; reason: SemanticFailure };

export function buildEmbeddingText(subject: string, bodyPreview: string): string | null {
  return prepareTicketEmbeddingText(subject, bodyPreview) || null;
}

/** Index the persisted source, not a caller's possibly stale copy of its text. */
export async function maybeGenerateTicketEmbedding(args: MaybeGenerateTicketEmbeddingArgs): Promise<TicketEmbeddingOutcome> {
  const service = createBackendSemanticService({ db: args.supabase, space: args.space,
    scope: { accountId: args.accountId, actor: { kind: 'workflow', id: 'ticket_index' }, permissions: ['index'], ticketId: args.ticketId },
    embed: args.embedFn ? text => args.embedFn!(text,{ ticketId: args.ticketId, accountId: args.accountId }) : undefined });
  const result = await service.indexSource({ source: { kind: 'ticket', id: args.ticketId } });
  if (result.status === 'failed' || result.status === 'skipped') return result;
  return { status: 'ok' };
}
