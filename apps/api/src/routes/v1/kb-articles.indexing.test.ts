import { expect, it, mock } from 'bun:test';

const requested: unknown[] = [];
const article = { id: 'acme-article', title: 'Exports', content: 'Enable exports.', is_published: true };
mock.module('../../lib/auth.js', () => ({ resolveUserAndAccount: async () => ({ userId: 'acme-agent', accountId: 'acme-account' }) }));
mock.module('../../lib/semantic-indexing.js', () => ({ requestSemanticIndexing: async (_db: unknown, _account: string, refs: unknown) => { requested.push(refs); } }));
mock.module('../../lib/supabase.js', () => {
  const query = { update: () => query, eq: () => query, select: () => query, maybeSingle: async () => ({ data: article, error: null }) };
  return { supabase: { from: () => query } };
});
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
const { kbArticles } = await import('./kb-articles');

const put = (body: unknown) => kbArticles.request('/acme-article', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic' }, body: JSON.stringify(body) });

it('refreshes the semantic index when an article is published without editing its text', async () => {
  requested.length = 0;
  expect((await put({ is_published: true })).status).toBe(200);
  expect(requested).toEqual([[{ kind: 'kb_article', id: 'acme-article' }]]);
});

it('does not reindex when only the tags change', async () => {
  requested.length = 0;
  expect((await put({ tags: ['billing'] })).status).toBe(200);
  expect(requested).toEqual([]);
});
