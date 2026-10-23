import { describe, it, expect } from 'bun:test';
import { RESOLVED_STATUSES } from '@kairo/types';
import { findResolvedCases, retrieveTicketContext, RESOLVED_STATUS_FILTER, ticketQueryText } from './ticket-context.js';
import { backendFixture, space } from './semantic-service.test-fixture.js';

describe('ticket context service integration', () => {
  it('uses the resolved status profile for every allowed final status', async () => {
    const f = backendFixture();
    expect(await findResolvedCases({ ticketId: 'source', accountId: 'acme' },{ supabase:f.db,embed:f.embed,space })).toEqual([]);
    expect(RESOLVED_STATUS_FILTER.split(',')).toEqual([...RESOLVED_STATUSES]);
    expect(f.calls.find(call => call.name === 'retrieve_semantic_sources')?.args).toMatchObject({ p_account_id:'acme', p_status_filter:RESOLVED_STATUS_FILTER, p_threshold:0.75 });
  });
  it('distinguishes missing indices from a completed empty search', async () => {
    const f = backendFixture('ticket',{ ticket:{ status:'unavailable',reason:'index_missing',matches:[] } });
    expect(await findResolvedCases({ ticketId:'source',accountId:'acme' },{ supabase:f.db,embed:f.embed,space })).toBeNull();
  });
  it('reports partial knowledge failure and keeps source states explicit', async () => {
    const f = backendFixture('ticket',{ knowledge_version:{ status:'unavailable',reason:'index_incompatible',matches:[] } });
    const result = await retrieveTicketContext({ ticketId:'source',accountId:'acme',queryText:'Acme question' },{ supabase:f.db,embed:f.embed,space });
    expect(result.degraded).toEqual(['kb_rpc_failed']);
    expect(result.kbArticles).toEqual([]);
  });
  it('keeps missing knowledge distinct from a provider outage', async () => {
    const f = backendFixture();
    const result = await retrieveTicketContext({ ticketId:'source',accountId:'acme',queryText:'Acme question' },{ supabase:f.db,space,embed:async()=>{ throw new Error('down'); } });
    expect(result.degraded).toContain('embedding_unavailable');
    expect(result.degraded).toContain('cases_rpc_failed');
  });
  it('bounds the ticket query body', () => {
    expect(ticketQueryText('Acme','x'.repeat(500)).length).toBe(4+2+200);
  });
});
