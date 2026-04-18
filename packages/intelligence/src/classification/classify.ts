import { createCompletionProvider } from '../config/providers';
import { buildClassificationSchema, type ClassificationResult } from './schema';
import { buildPrompt, loadPrompt } from './prompt';
import type { EmailMessage } from './types';
import type { CompletionOptions } from '../providers/base';

export async function classifyEmail(
  message: EmailMessage,
  options?: Pick<CompletionOptions, 'temperature'>
): Promise<ClassificationResult> {
  const provider = createCompletionProvider();

  // Load prompt and allowed values from the single source of truth (prompt file)
  const { allowed } = await loadPrompt();
  const schema = buildClassificationSchema(allowed);
  const prompt = await buildPrompt(message);

  return provider.completeJSON(prompt, schema, options);
}
