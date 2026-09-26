export { classifyEmail, classifyEmailWithMeta, type ClassifyOptions, type LangfuseContext } from './classify';
export { classifyEmailWithJev } from './classify-with-jev';
export {
  ClassificationSchema,
  TICKET_TYPE,
  PRIORITY,
  CATEGORY,
  TONE,
  URGENCY,
  type ClassificationResult,
  type ModelVerdictResult,
  type TicketType,
  type Priority,
  type Category,
  type Tone,
  type Urgency,
} from './schema';
export { buildPrompt, getPromptVersion, extractPromptVersion, SUPPORTED_LANGS, DEFAULT_LANG, type PromptLang } from './prompt';
export { GMAIL_CATEGORIES } from './types';
export type { EmailMessage, MailFacts, GmailCategory, AuthResult } from './types';
export {
  TYPE_DERIVATION,
  DERIVATION_VERSION,
  provenanceOf,
  derivationKey,
  deriveTicketType,
  deriveClassification,
  reachableTypes,
  type DerivationKey,
  type ModelVerdict,
} from './derive';
export { stripQuotedThread } from './strip-quotes';
