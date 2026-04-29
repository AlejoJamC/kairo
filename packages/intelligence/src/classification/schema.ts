import { z } from 'zod';

/**
 * Canonical, language-neutral classification contract.
 *
 * These enum values are **stable IDs**, not translations. Prompts may be
 * written in any language (es, en, pt, ...), but the JSON the model emits
 * always carries these exact English identifiers. UI layers translate IDs
 * into human-readable labels; downstream code (scoring, analytics, pipelines)
 * treats them as opaque.
 */

export const TICKET_TYPE = ['support', 'prospect', 'spam', 'internal', 'other'] as const;
export const PRIORITY    = ['P1', 'P2', 'P3'] as const;
export const CATEGORY    = ['technical', 'billing', 'account', 'general', 'not_applicable'] as const;
export const TONE        = ['aggressive', 'frustrated', 'neutral', 'positive'] as const;
export const URGENCY     = ['high', 'medium', 'low'] as const;

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
