import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/20261023103232_embeddings_domain.sql');
const workflow = read('supabase/migrations/20261012090531_decision_workflows_and_knowledge_history.sql');
const functions = [...migration.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\([\s\S]*?\$\$;/g)];

describe('embeddings domain boundaries without a database', () => {
  it('keeps the core independent of applications, Supabase and business scheduling', () => {
    const directory = new URL('packages/intelligence/src/embeddings/', root);
    for (const name of readdirSync(directory).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
      const source = readFileSync(new URL(name, directory), 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:apps\/|supabase|decision-workflow|workflow-knowledge)/);
      expect(source).not.toMatch(/\b(?:enqueue_knowledge|decision_work_items|knowledge_candidate_runs)\b/);
    }
  });

  it('limits domain persistence to its index and keeps scheduling outside its functions', () => {
    const domain = functions.filter(fn => fn[1] !== 'enqueue_knowledge_candidates');
    expect(domain.map(fn => fn[1]).sort()).toEqual([
      'retrieve_semantic_sources', 'semantic_index_vector', 'semantic_revision', 'semantic_source', 'semantic_source_similarity', 'semantic_sources', 'store_semantic_index',
    ]);
    for (const fn of domain) {
      const source = fn[0].replace(/\bFOR UPDATE(?: OF \w+)?/g, '').replace(/\bDO UPDATE SET/g, '');
      const writes = [...source.matchAll(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?(\w+)/g)].map(match => match[1]);
      expect(writes.every(table => table === 'semantic_indexes')).toBe(true);
      expect(source).not.toMatch(/\b(?:decision_work_items|ticket_decision_history|knowledge_candidate_runs|enqueue_\w+)\b/);
    }
  });

  it('installs definitions and permissions without invoking operations or creating processing triggers', () => {
    const statements = migration.replace(/\$\$[\s\S]*?\$\$/g, '$$body$$').replace(/--[^\n]*/g, '').split(';').map(value => value.trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^(?:CREATE (?:OR REPLACE )?(?:TABLE|INDEX|FUNCTION)|ALTER TABLE|REVOKE|GRANT)\b/);
    }
    expect(migration).not.toContain('CREATE TRIGGER');
  });

  it('delegates vector access and comparison while preserving the existing knowledge policy instead of introducing a second workflow', () => {
    const original = workflow.match(/CREATE FUNCTION public\.enqueue_knowledge_candidates\([\s\S]*?\$\$;/)![0];
    const adapted = functions.find(fn => fn[1] === 'enqueue_knowledge_candidates')![0];
    const score = "semantic_source_similarity(t.account_id,'ticket',t.id,'knowledge_version',v.id)";
    const normalized = adapted.replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION')
      .replace('knowledge_indexed boolean;', 'emb extensions.vector;')
      .replace("SELECT semantic_source_similarity(v.account_id,'knowledge_version',v.id,'knowledge_version',v.id) IS NOT NULL INTO knowledge_indexed;", 'SELECT embedding INTO emb FROM knowledge_embeddings WHERE version_id=v.id;')
      .replace(`ORDER BY ${score} DESC`, 'ORDER BY t.embedding <=> emb')
      .replaceAll(`${score} IS NOT NULL`, 't.embedding IS NOT NULL')
      .replaceAll(`${score} IS NULL`, 't.embedding IS NULL')
      .replaceAll(score, '1-(t.embedding <=> emb)')
      .replaceAll('NOT knowledge_indexed', 'emb IS NULL').replaceAll('knowledge_indexed', 'emb IS NOT NULL');
    expect(adapted).not.toMatch(/<=>|semantic_indexes|knowledge_embeddings|extensions\.vector/);
    expect(normalized).toBe(original);
    expect(functions.filter(fn => fn[1]!.startsWith('enqueue_')).map(fn => fn[1])).toEqual(['enqueue_knowledge_candidates']);
  });

  it('routes application consumers through the service instead of selecting providers or calling vector RPCs', () => {
    const consumers = ['ticket-embedding', 'kb-embedding', 'ticket-context', 'semantic-ticket-search', 'workflow-knowledge', 'decision-workflow', 'agent-tools'];
    for (const name of consumers) {
      const source = read(`apps/api/src/lib/${name}.ts`);
      expect(source).not.toMatch(/\b(?:generateEmbedding|createEmbeddingProvider|configuredEmbeddingDimensions)\b/);
      expect(source).not.toMatch(/resolveModelRoute\(['"]embedding['"]/);
      expect(source).not.toMatch(/\.rpc\(['"](?:semantic_|store_semantic_|retrieve_semantic_|read_semantic_)/);
    }
    expect(read('apps/api/src/lib/agent-tools.ts')).not.toMatch(/\b(?:cosine|groupBySimilarity)\b/);
  });
});
