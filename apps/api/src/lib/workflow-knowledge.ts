import { z } from 'zod';
import { supabase } from './supabase.js';
import { ProviderError } from '@kairo/intelligence';

export const KnowledgeVersionSchema = z.object({
  id: z.string(), account_id: z.string(), source_kind: z.enum(['article', 'learning']), source_id: z.string(),
  revision: z.number(), status: z.string(), snapshot: z.record(z.string(), z.unknown()),
});
export type KnowledgeVersion = z.infer<typeof KnowledgeVersionSchema>;
export async function approvedWorkflowKnowledge(accountId: string, query: string, ticketId?: string, db = supabase) {
  const { data, error } = await db.rpc('find_workflow_knowledge', { p_account_id: accountId, p_query: query, p_ticket_id: ticketId ?? null });
  if (error) throw new ProviderError('Approved knowledge lookup failed', true);
  return z.array(KnowledgeVersionSchema).parse(data ?? []).filter(version => version.status === 'approved' && version.account_id === accountId);
}
export function knowledgeReferences(versions: KnowledgeVersion[]) {
  return versions.map(v => ({ id: v.source_id, version: v.id,
    content: String(v.snapshot['content'] ?? v.snapshot['summary'] ?? ''), kind: v.source_kind }));
}
