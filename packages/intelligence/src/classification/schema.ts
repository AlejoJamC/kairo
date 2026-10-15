import { z } from 'zod';
import {
  TICKET_TYPES, TICKET_PRIORITIES, TICKET_CATEGORIES, TICKET_TONES, TICKET_URGENCIES,
  ACTIONABILITY, SUBJECT_MATTER,
} from '@kairo/types';



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

export type ModelVerdictResult = z.infer<typeof ModelVerdictSchema> & {
  evidence?: NonNullable<import('./types').EmailMessage['evidence']>;
  workflow?: { contract: string; version: string; judgments: Record<string, string> };
  decision?: {
    answers: Record<string, { type: 'choice'; choice: string; confidence: number; probabilities?: Record<string, number> }>;
    stateVersion: string;
    questionsVersion: string;
    compositionVersion: string;
    stage: string;
    evidence: NonNullable<import('./types').EmailMessage['evidence']>;
    typeConfidence: number;
    reviewReasons: string[];
  };
};
