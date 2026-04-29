export {
  classifyEmail,
  buildPrompt,
  ClassificationSchema,
  TICKET_TYPE,
  PRIORITY,
  CATEGORY,
  TONE,
  URGENCY,
  SUPPORTED_LANGS,
  DEFAULT_LANG,
} from './classification';
export type {
  ClassificationResult,
  EmailMessage,
  ClassifyOptions,
  PromptLang,
  TicketType,
  Priority,
  Category,
  Tone,
  Urgency,
} from './classification';

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
