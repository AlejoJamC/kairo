import { mock } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceResult } from '@kairo/intelligence';
export const space = { provider: 'synthetic', model: 'acme', dimensions: 2 };
export function backendFixture(kind = 'ticket', results: Record<string, Omit<SourceResult,'source'>> = {}) {
  const calls: { name: string; args: Record<string,unknown> }[] = [];
  const embed = mock(async (_text: string, _context?: { accountId?: string; ticketId?: string }) => [1,0]);
  const db = { rpc: async (name: string,args: Record<string,unknown>) => {
    calls.push({ name,args });
    if (name === 'semantic_source') return { data: { reference: { kind,id:'source' }, accountId: 'acme', revision: 'r1', text: 'Persisted Acme text', preparation: 'v1' }, error: null };
    if (name === 'store_semantic_index') return { data: 'indexed', error: null };
    if (name === 'retrieve_semantic_sources') return { data: results[String(args.p_kind)] ?? { status: 'ok', matches: [] }, error: null };
    throw new Error('Unexpected synthetic RPC');
  } } as unknown as SupabaseClient;
  return { db,calls,embed };
}
