import { z } from 'zod';
import { TICKET_TYPES, TICKET_PRIORITIES, TICKET_CATEGORIES, TICKET_TONES, TICKET_URGENCIES } from '@kairo/types';

/**
 * Canonical, language-neutral classification contract.
 *
 * These enum values are **stable IDs**, not translations. Prompts may be
 * written in any language (es, en, pt, ...), but the JSON the model emits
 * always carries these exact English identifiers. UI layers translate IDs
 * into human-readable labels; downstream code (scoring, analytics, pipelines)
 * treats them as opaque.
 *
 * type/priority/category/tone/urgency are the same vocabulary @kairo/types
 * defines as the single source of truth — imported rather than declared
 * here, so this package can't drift from it.
 */

export const TICKET_TYPE = TICKET_TYPES;
export const PRIORITY    = TICKET_PRIORITIES;
export const CATEGORY    = TICKET_CATEGORIES;
export const TONE        = TICKET_TONES;
export const URGENCY     = TICKET_URGENCIES;

export type TicketType = (typeof TICKET_TYPE)[number];
export type Priority   = (typeof PRIORITY)[number];
export type Category   = (typeof CATEGORY)[number];
export type Tone       = (typeof TONE)[number];
export type Urgency    = (typeof URGENCY)[number];

export const ClassificationSchema = z.object({
  type: z.enum(TICKET_TYPE),
  priority: z.enum(PRIORITY),
  category: z.enum(CATEGORY),
  tone: z.enum(TONE),
  urgency: z.enum(URGENCY),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;
