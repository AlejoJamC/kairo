import { describe, expect, it } from 'bun:test';
import { checkEmbeddingDimensions } from './embedding-dimensions';

const columns = (dimensions: number) => [
  { table_name: 'tickets', dimensions: 768 },
  { table_name: 'kb_articles', dimensions: 768 },
  { table_name: 'knowledge_embeddings', dimensions },
];

describe('checkEmbeddingDimensions', () => {
  it('accepts a model whose dimensions match every vector column', async () => {
    expect(await checkEmbeddingDimensions({ readColumns: async () => columns(768), configured: () => 768 }))
      .toEqual({ status: 'consistent', configured: 768 });
  });

  it('reports each column the configured model disagrees with', async () => {
    const check = await checkEmbeddingDimensions({ readColumns: async () => columns(768), configured: () => 512 });
    expect(check).toMatchObject({ status: 'mismatch', configured: 512 });
    expect(check.status === 'mismatch' && check.columns.map(column => column.table_name)).toEqual(['tickets', 'kb_articles', 'knowledge_embeddings']);
  });

  it('does not claim consistency when the database cannot be read or has no vector columns', async () => {
    expect(await checkEmbeddingDimensions({ readColumns: async () => { throw new Error('down'); }, configured: () => 768 }))
      .toEqual({ status: 'unverified', reason: 'database_unavailable' });
    expect(await checkEmbeddingDimensions({ readColumns: async () => [], configured: () => 768 }))
      .toEqual({ status: 'unverified', reason: 'columns_not_found' });
  });

  it('treats an invalid dimensions setting as unverified rather than consistent', async () => {
    expect(await checkEmbeddingDimensions({ readColumns: async () => columns(768), configured: () => { throw new Error('invalid'); } }))
      .toEqual({ status: 'unverified', reason: 'invalid_configuration' });
  });
});
