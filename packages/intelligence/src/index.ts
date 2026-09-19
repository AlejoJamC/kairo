export {
  classifyEmail,
  classifyEmailWithMeta,
  buildPrompt,
  getPromptVersion,
  extractPromptVersion,
  ClassificationSchema,
  TICKET_TYPE,
  PRIORITY,
  CATEGORY,
  TONE,
  URGENCY,
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  stripQuotedThread,
  GMAIL_CATEGORIES,
} from './classification';
export type {
  ClassificationResult,
  EmailMessage,
  MailFacts,
  GmailCategory,
  AuthResult,
  ClassifyOptions,
  LangfuseContext,
  PromptLang,
  TicketType,
  Priority,
  Category,
  Tone,
  Urgency,
} from './classification';

export { generateEmbedding, generateEmbeddings } from './embeddings';

export { ProviderError } from './providers/base';
export type {
  CompletionProvider,
  EmbeddingProvider,
  CompletionOptions,
  CompletionUsage,
  CompletionMeta,
} from './providers/base';

export {
  createCompletionProvider,
  createEmbeddingProvider,
} from './config/providers';

export { detectEscalationTriggers } from './escalation';
export type {
  EscalationContext,
  EscalationReason,
  EscalationDetectionResult,
  EscalationTriggerId,
} from './escalation';
