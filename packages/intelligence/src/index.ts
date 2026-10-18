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

export { ProviderError, ProviderConfigurationError } from './providers/base';
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
  createTextProvider,
  resolveTextProviderId,
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
  authorizeTicketTypeAction,
  DEFAULT_CONFIDENCE_THRESHOLD,
  type ClassificationReviewRow,
  type TicketTypeTrustStats,
  type ActionAuthorization,
  type ActionAuthorizationReason,
  type ActionMode,
  type AuthorizeTicketTypeActionInput,
} from './autonomy';

export { detectEscalationTriggers } from './escalation';
export type {
  EscalationContext,
  EscalationReason,
  EscalationDetectionResult,
  EscalationTriggerId,
} from './escalation';

export {
  KNOWLEDGE_TYPES,
  EVIDENCE_QUALITIES,
  KnowledgeDecisionSchema,
  KnowledgeAnswersSchema,
  KNOWLEDGE_QUESTIONS_VERSION,
  type KnowledgeAnswers,
  KnowledgeDraftSchema,
  buildKnowledgeQuestions,
  parseKnowledgeAnswers,
  shouldDraftKnowledge,
  type KnowledgeType,
  type EvidenceQuality,
  type KnowledgeDecision,
  type KnowledgeDraft,
} from './knowledge';

export { runAgentFeature, OperationResultSchema, type OperationResult, type AgentTool } from './harness/run-agent-feature';
export { runAgent, inlineAgentSteps, type AgentContract, type AgentRunRequest, type AgentStepRunner } from './harness/run-agent';
export { TICKET_ASSISTANT_CONTRACT } from './harness/run-agent-feature';
export { BusinessSynthesisSchema, BUSINESS_SYNTHESIS_CONTRACT, type BusinessSynthesis } from './knowledge/business-synthesis';
export { askJudgments, JudgmentRequestSchema, type JudgmentRequest } from './harness/ask-judgments';
export { GatewayCompletionProvider } from './providers/gateway/completion';
export { GatewayEmbeddingProvider } from './providers/gateway/embedding';

export { resolveModelRoute, usesDecisionClassification, MODEL_ROLES, type ModelRoute, type ModelRole } from './config/model-roles';
export { GatewayDecisionProvider } from './providers/gateway/decision';
export { classifyEmailWithDecision } from './classification/classify-with-decision';

export { gatewayProvenance } from './providers/gateway/client';
export {
  EMAIL_KNOWLEDGE_VERSION, buildEmailKnowledgeQuestions, EmailKnowledgeCandidateSchema,
  EmailKnowledgeDraftSchema, buildEmailKnowledgeValidationQuestions,
  EmailKnowledgeValidationSchema, knowledgeReviewReasons,
  type EmailKnowledgeProposal, type EmailKnowledgeValidation,
} from './knowledge/email-knowledge';
export { SOURCE_REFERENCE_VERSION, sourceFragments, ReferencedKnowledgeDraftSchema, resolveSourceReferences,
  type SourceFragment, type ReferencedKnowledgeDraft } from './knowledge/source-fragments';

export { knowledgeImpactQuestions, workflowContract, workflowQuestions, workflowLanguageSchema, workflowAnswersSchema, attentionRecommendation, WORKFLOW_VERSION } from './classification/workflow-contract';

export { ReferencedWorkflowAnalysisSchema, workflowEvidenceFragments, resolveWorkflowEvidence, WorkflowAnalysisSchema, groundWorkflowAnalysis, supportedNextAction, type WorkflowAnalysis, type WorkflowSource } from './classification/workflow-analysis';

export { buildTicketVerdictQuestions, TicketAnswersSchema } from './classification/decision-questions';

export { configuredEmbeddingDimensions, STORED_EMBEDDING_DIMENSIONS } from './config/providers';
