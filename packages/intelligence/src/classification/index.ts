export { classifyEmail, type ClassifyOptions } from './classify';
export {
  ClassificationSchema,
  TICKET_TYPE,
  PRIORITY,
  CATEGORY,
  TONE,
  URGENCY,
  type ClassificationResult,
  type TicketType,
  type Priority,
  type Category,
  type Tone,
  type Urgency,
} from './schema';
export { buildPrompt, SUPPORTED_LANGS, DEFAULT_LANG, type PromptLang } from './prompt';
export type { EmailMessage } from './types';
