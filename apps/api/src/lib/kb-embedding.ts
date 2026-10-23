import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareArticleEmbeddingText, type SemanticFailure, type VectorSpace } from '@kairo/intelligence';
import { createBackendSemanticService } from './semantic-service.js';

export function buildKbEmbeddingText(title: string, content: string): string | null {
  return prepareArticleEmbeddingText(title, content) || null;
}
export interface MaybeGenerateKbEmbeddingArgs {
  supabase: SupabaseClient;
  articleId: string;
  accountId: string;
  title: string;
  content: string;
  embedFn?: (text: string, context?: { accountId?: string }) => Promise<number[]>;
  space?: VectorSpace;
}
export type KbEmbeddingOutcome = { status: 'ok' } | { status: 'skipped'; reason: 'empty_text' } |
  { status: 'failed'; reason: SemanticFailure };

export async function maybeGenerateKbEmbedding(args: MaybeGenerateKbEmbeddingArgs): Promise<KbEmbeddingOutcome> {
  const service = createBackendSemanticService({ db: args.supabase, space: args.space,
    scope: { accountId: args.accountId, actor: { kind: 'workflow', id: 'article_index' }, permissions: ['index'] },
    embed: args.embedFn ? text => args.embedFn!(text,{ accountId: args.accountId }) : undefined });
  const result = await service.indexSource({ source: { kind: 'kb_article', id: args.articleId } });
  if (result.status === 'failed' || result.status === 'skipped') return result;
  return { status: 'ok' };
}
