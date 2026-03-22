import { z } from 'zod';

export const ClassificationSchema = z.object({
  tipo: z.enum(['support', 'lead', 'spam']),
  prioridad: z.enum(['P1', 'P2', 'P3']),
  categoria: z.enum(['technical', 'billing', 'sales', 'other']),
  sentimiento: z.enum(['urgente', 'neutral', 'casual']),
  razonamiento: z.string(),
  confianza: z.number().min(0).max(1),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;
