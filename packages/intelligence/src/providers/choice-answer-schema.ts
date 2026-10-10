import { z } from 'zod';

export function choiceAnswerSchema(criteria: Record<string, unknown>) {
  const values = Object.keys(criteria) as [string, ...string[]];
  return z.object({
    type: z.literal('choice'),
    choice: z.enum(values),
    confidence: z.number().min(0).max(1),
    probabilities: z.record(z.enum(values), z.number().min(0).max(1)),
  }).superRefine((answer, ctx) => {
    const sum = Object.values(answer.probabilities).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 1) > 0.01) ctx.addIssue({ code: 'custom', message: 'Choice probabilities must sum to one' });
    const selected = answer.probabilities[answer.choice];
    if (selected === undefined || Object.values(answer.probabilities).some((value) => value > selected + 0.0001)) {
      ctx.addIssue({ code: 'custom', message: 'Choice must match the highest probability' });
    }
  });
}
