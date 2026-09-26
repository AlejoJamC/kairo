export {
  classifyEmail,
  classifyEmailWithMeta,
  classifyEmailWithJev,
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
  TYPE_DERIVATION,
  DERIVATION_VERSION,
  provenanceOf,
  derivationKey,
  deriveTicketType,
  deriveClassification,
  reachableTypes,
} from './classification';
export type {
  ClassificationResult,
  EmailMessage,
  MailFacts,
  GmailCategory,
  AuthResult,
  DerivationKey,
  ModelVerdict,
  ModelVerdictResult,
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

export {
  runLlmFeature,
  runLlmTextFeature,
  runDecisionFeature,
  withGeneration,
  usageDetails,
  loadPromptTemplate,
  fillTemplate,
  LlmFeatureError,
} from './harness';
export type {
  LlmCallRecord,
  LlmCallLogger,
  LlmFeatureJsonRequest,
  LlmFeatureResult,
  LlmFeatureErrorCode,
  GenerationSpec,
  DecisionFeatureRequest,
  DecisionFeatureResult,
} from './harness';

export { ProviderError } from './providers/base';
export type {
  CompletionProvider,
  EmbeddingProvider,
  CompletionOptions,
  CompletionUsage,
  CompletionMeta,
} from './providers/base';

export type { DecisionProvider, DecisionResult, TypedDecisionInput } from './providers/decision';
export { JevDecisionProvider } from './providers/jev/decision';

export {
  createCompletionProvider,
  createEmbeddingProvider,
  createDecisionProvider,
  type DecisionProviderId,
} from './config/providers';

export { initialLearningStatus } from './learning';

export { resolveRoundRobinAssignee, type AgentWorkload } from './routing';

export {
  computeTrustStatsByType,
  resolveAutoApprovalEnabled,
  TRUST_REVIEW_WINDOW,
  type ClassificationReviewRow,
  type TicketTypeTrustStats,
} from './autonomy';

export { detectEscalationTriggers } from './escalation';
export type {
  EscalationContext,
  EscalationReason,
  EscalationDetectionResult,
  EscalationTriggerId,
} from './escalation';
