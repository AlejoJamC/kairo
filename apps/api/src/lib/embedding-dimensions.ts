import { configuredEmbeddingDimensions } from '@kairo/intelligence';

export interface ColumnDimensions { table_name: string; dimensions: number }

export type DimensionCheck =
  | { status: 'consistent'; configured: number }
  | { status: 'mismatch'; configured: number; columns: ColumnDimensions[] }
  | { status: 'unverified'; reason: string };

/**
 * Compares the configured embedding model with every vector column it writes
 * to and is compared against. A mismatch would store vectors pgvector rejects,
 * or compare vectors from different spaces, so it must stop the API.
 */
export async function checkEmbeddingDimensions(deps: {
  readColumns: () => Promise<ColumnDimensions[]>;
  configured?: () => number;
}): Promise<DimensionCheck> {
  let configured: number;
  try { configured = (deps.configured ?? (() => configuredEmbeddingDimensions()))(); }
  catch { return { status: 'unverified', reason: 'invalid_configuration' }; }
  let columns: ColumnDimensions[];
  try { columns = await deps.readColumns(); }
  catch { return { status: 'unverified', reason: 'database_unavailable' }; }
  if (!columns.length) return { status: 'unverified', reason: 'columns_not_found' };
  const mismatched = columns.filter(column => column.dimensions !== configured);
  return mismatched.length ? { status: 'mismatch', configured, columns: mismatched } : { status: 'consistent', configured };
}
