import { z } from "zod";

export const ClassificationOutputSchema = z.object({
  tipo: z.enum(["support", "lead", "spam"]),
  prioridad: z.enum(["P1", "P2", "P3"]),
  categoria: z.enum(["technical", "billing", "sales", "other"]),
  sentimiento: z.enum(["urgente", "neutral", "casual"]),
  razonamiento: z.string(),
  confianza: z.number().min(0).max(1),
});

export const ClassifyResponseSchema = z.object({
  ticket_id: z.string().uuid(),
  classification: ClassificationOutputSchema,
  classified_at: z.string(),
  tier: z.number().int(),
});

export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;
export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;
