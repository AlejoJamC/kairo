import { expect, test } from 'bun:test';
import { semanticStorage } from './semantic-storage';
import { workflowStorage } from './workflow-storage';
import { workflowControls } from './workflow-scenarios';
import { semanticFlowEvidence } from './technical';

test('a skipped test or a partial trace cannot count as an executed consumer flow', () => {
  expect(semanticFlowEvidence('1 skip\n0 fail')).toBeNull();
  expect(semanticFlowEvidence(JSON.stringify({ semanticFlow: true, storage: 'real_local_supabase', steps: [] }))).toBeNull();
});

// Exercise the domain using the same scenario storage as workflow evaluations.
test('retrieval requires a consumer-written current index and preserves account and version boundaries', async () => {
  const store = workflowStorage(workflowControls('reply')[0]!);
  const semantic = semanticStorage(store);
  const service = semantic.service({ db: store.db, scope: { accountId: store.identity.accountId,
    actor: { kind: 'workflow', id: 'eval' }, permissions: ['index','retrieve'] } });
  const version = store.current()[0]!;
  const request = { purpose: 'approved_knowledge' as const, sources: ['knowledge_version'], query: { text: 'Account recovery' } };
  expect(await service.retrieve(request)).toMatchObject({ status: 'unavailable', sources: [{ reason: 'index_missing' }] });
  expect(await service.indexSource({ source: { kind: 'knowledge_version', id: String(version['id']) } })).toMatchObject({ status: 'indexed' });
  const writes = store.writes.length;
  expect(await service.indexSource({ source: { kind: 'knowledge_version', id: String(version['id']) } })).toMatchObject({ status: 'unchanged' });
  expect(store.writes).toHaveLength(writes);
  expect(await service.retrieve(request)).toMatchObject({ status: 'ok', matches: [{ version: version['id'], authority: 'approved_knowledge' }] });
  const foreign = semantic.service({ db: store.db, scope: { accountId: 'acme-other', actor: { kind: 'workflow', id: 'eval' }, permissions: ['retrieve'] } });
  expect((await foreign.retrieve(request)).matches).toEqual([]);
  version['status'] = 'withdrawn';
  expect((await service.retrieve(request)).matches).toEqual([]);
});
