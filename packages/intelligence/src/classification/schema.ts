import { z } from 'zod';
import type { AllowedValues } from './prompt';

/**
 * Builds the Zod classification schema dynamically from the allowed values
 * parsed out of the prompt frontmatter.
 *
 * This is the enforcement layer: if the model returns any value not in the
 * frontmatter lists, Zod throws and the email is recorded as an error.
 * That is intentional — it means the prompt needs fixing.
 */
export function buildClassificationSchema(allowed: AllowedValues) {
  return z.object({
    tipo: z.enum(allowed.tipo),
    prioridad: z.enum(allowed.prioridad),
    categoria: z.enum(allowed.categoria),
    tono: z.enum(allowed.tono),
    urgencia: z.enum(allowed.urgencia),
    razonamiento: z.string(),
    confianza: z.number().min(0).max(1),
  });
}

export type ClassificationResult = z.infer<ReturnType<typeof buildClassificationSchema>>;
