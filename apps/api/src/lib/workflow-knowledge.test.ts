import { describe, expect, it, mock } from 'bun:test';
import { ProviderError } from '@kairo/intelligence';

// The module validates its environment on import; synthetic values keep this suite independent of file order.
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
delete process.env['EMBEDDING_SIMILARITY_THRESHOLD'];
const { approvedWorkflowKnowledge, knowledgeEmbeddingText } = await import('./workflow-knowledge');

const approved = { id: 'version', account_id: 'acme-account', source_kind: 'article', source_id: 'article', revision: 1, status: 'approved', snapshot: { content: 'Synthetic' } };

function database(rows: unknown[]) {
  const rpc = mock(async (_name: string, _args: Record<string, unknown>) => ({ data: rows, error: null }));
  return { db: { rpc } as never, rpc };
}

describe('approvedWorkflowKnowledge', () => {
  it('searches by the query vector with the configured similarity threshold', async () => {
    const { db, rpc } = database([approved]);
    const result = await approvedWorkflowKnowledge('acme-account', 'Synthetic question', 'ticket', db, { embed: async () => [0.1, 0.2], threshold: 0.85 });
    expect(rpc).toHaveBeenCalledWith('find_workflow_knowledge', { p_account_id: 'acme-account', p_query_embedding: [0.1, 0.2], p_ticket_id: 'ticket', p_threshold: 0.85 });
    expect(result.map(row => row.id)).toEqual(['version']);
  });

  it('defaults to the configured threshold from the environment', async () => {
    const { db, rpc } = database([]);
    await approvedWorkflowKnowledge('acme-account', 'Synthetic question', undefined, db, { embed: async () => [0.1] });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_threshold: 0.8, p_ticket_id: null });
  });

  it('turns a failed embedding into a failed lookup instead of an empty result', async () => {
    const { db, rpc } = database([approved]);
    const failure = await approvedWorkflowKnowledge('acme-account', 'Synthetic', undefined, db, { embed: async () => { throw new Error('down'); } }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).retriable).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('drops anything that is not approved or belongs to another account', async () => {
    const { db } = database([approved, { ...approved, id: 'pending', status: 'pending_review' }, { ...approved, id: 'foreign', account_id: 'other' }]);
    const result = await approvedWorkflowKnowledge('acme-account', 'Synthetic', undefined, db, { embed: async () => [0.1] });
    expect(result.map(row => row.id)).toEqual(['version']);
  });
});

describe('knowledgeEmbeddingText', () => {
  it('embeds the title with the article content or the learning summary', () => {
    expect(knowledgeEmbeddingText({ snapshot: { title: 'Access recovery', content: 'Reset access.' } })).toBe('Access recovery\nReset access.');
    expect(knowledgeEmbeddingText({ snapshot: { summary: 'Refunds need approval.', evidence: { title: 'Refund policy' } } })).toBe('Refund policy\nRefunds need approval.');
  });
});
