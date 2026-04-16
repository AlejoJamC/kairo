import { createCompletionProvider } from '../config/providers';
import { ClassificationSchema, type ClassificationResult } from './schema';
import { buildPrompt } from './prompt';
import type { EmailMessage } from './types';
import type { CompletionOptions } from '../providers/base';

export async function classifyEmail(
  message: EmailMessage,
  options?: Pick<CompletionOptions, 'temperature'>
): Promise<ClassificationResult> {
  const provider = createCompletionProvider();
  const prompt = await buildPrompt(message);
  return provider.completeJSON(prompt, ClassificationSchema, options);
}
