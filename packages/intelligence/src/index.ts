export { classifyEmail } from './classification';
export type { ClassificationResult, EmailMessage, AllowedValues } from './classification';
export { buildClassificationSchema, loadPrompt } from './classification';

export { generateEmbedding, generateEmbeddings } from './embeddings';

export type {
  CompletionProvider,
  EmbeddingProvider,
  CompletionOptions,
} from './providers/base';

export {
  createCompletionProvider,
  createEmbeddingProvider,
} from './config/providers';
