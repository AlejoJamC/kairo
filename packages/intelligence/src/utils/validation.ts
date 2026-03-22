import { z } from 'zod';

export function parseJSON<T>(schema: z.ZodSchema<T>, raw: string): T {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON object found in string: ${raw.slice(0, 200)}`);
  }

  const parsed: unknown = JSON.parse(jsonMatch[0]);
  return schema.parse(parsed);
}

export function safeParseJSON<T>(
  schema: z.ZodSchema<T>,
  raw: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = parseJSON(schema, raw);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
