import type { RetrievalPurpose } from './service';
import { SEMANTIC_PREPARATIONS, prepareTicketEmbeddingText, prepareArticleEmbeddingText, prepareKnowledgeEmbeddingText } from './preparation';

interface SourceDefinition {
  kind: string;
  preparation: string;
  purposes: readonly RetrievalPurpose[];
  prepare(input: Record<string, unknown>): string;
}

/** Source representations belong to embeddings, independently of storage and consumers. */
export const SEMANTIC_SOURCE_DEFINITIONS = {
  ticket: {
    kind: 'ticket', preparation: SEMANTIC_PREPARATIONS.ticket, purposes: ['similar_cases'],
    prepare: (input: Record<string, unknown>) => prepareTicketEmbeddingText(String(input['subject'] ?? ''), String(input['body_plain'] || input['snippet'] || '')),
  },
  kb_article: {
    kind: 'kb_article', preparation: SEMANTIC_PREPARATIONS.kb_article, purposes: ['approved_knowledge'],
    prepare: (input: Record<string, unknown>) => prepareArticleEmbeddingText(String(input['title'] ?? ''), String(input['content'] ?? '')),
  },
  knowledge_version: {
    kind: 'knowledge_version', preparation: SEMANTIC_PREPARATIONS.knowledge_version, purposes: ['approved_knowledge'],
    prepare: prepareKnowledgeEmbeddingText,
  },
} as const satisfies Record<string, SourceDefinition>;
