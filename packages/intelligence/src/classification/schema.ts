import { z } from 'zod';
import {
  TICKET_TYPES, TICKET_PRIORITIES, TICKET_CATEGORIES, TICKET_TONES, TICKET_URGENCIES,
  ACTIONABILITY, SUBJECT_MATTER,
} from '@kairo/types';

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

// ---------------------------------------------------------------------------
// KAI-45 F2 — what the model is actually asked for.
//
// `type` leaves. The five types are the product of two independent questions
// and a message can be true on both, so a single five-way choice forces the
// model to collapse them itself — differently every time, and invisibly. It
// now answers the two questions separately and `derive.ts` multiplies them back
// out against the provenance the envelope already stated.
//
// Everything else stays exactly as it was:
//
//   category    is NOT derivable from `subject_matter`. billing / account /
//               technical are three different things that are all `service`,
//               and folding them would lose a field the dashboard shows.
//   confidence  stays until F3 replaces it with ensemble disagreement. It has
//               no discriminating power (measured gap 0.002–0.057 across seven
//               cells) but emitting a fabricated number in its place would be
//               worse than keeping an honest useless one.
//
// The provider sees this schema as a decoding grammar — Ollama compiles it to
// JSON Schema, Anthropic forces the tool call — so the model cannot answer off
// the enum.
// ---------------------------------------------------------------------------

export const ACTIONABILITY_VALUES = ACTIONABILITY;
export const SUBJECT_MATTER_VALUES = SUBJECT_MATTER;

export const ModelVerdictSchema = z.object({
  actionability: z.enum(ACTIONABILITY),
  subject_matter: z.enum(SUBJECT_MATTER),
  priority: z.enum(PRIORITY),
  category: z.enum(CATEGORY),
  tone: z.enum(TONE),
  urgency: z.enum(URGENCY),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

export type ModelVerdictResult = z.infer<typeof ModelVerdictSchema>;
