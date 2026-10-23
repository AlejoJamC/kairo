export { generateEmbedding, generateEmbeddings } from './embed';
export type { EmbeddingResult } from './types';
export { createSemanticService, sameVectorSpace } from './service';
export { SEMANTIC_SOURCE_DEFINITIONS } from './sources';
export type { SemanticService, SemanticServiceDeps, IndexRequest, StoredIndexResult, GroupingResult } from './service';
export { SEMANTIC_PREPARATIONS, prepareTicketEmbeddingText, prepareArticleEmbeddingText, prepareKnowledgeEmbeddingText } from './preparation';
export type { SemanticScope, SourceReference, VectorSpace, SemanticMatch, SemanticFailure, SourceResult,
  RetrievalResult, LoadedSemanticSource, IndexResult, RetrievalRequest, RetrievalPurpose, SemanticAdapter } from './service';
