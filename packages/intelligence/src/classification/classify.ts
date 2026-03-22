import { createCompletionProvider } from '../config/providers';
import { ClassificationSchema, type ClassificationResult } from './schema';
import { buildPrompt } from './prompt';
import type { EmailMessage } from './types';

export async function classifyEmail(
  message: EmailMessage
): Promise<ClassificationResult> {
  const provider = createCompletionProvider();
  const prompt = buildPrompt(message);
  return provider.completeJSON(prompt, ClassificationSchema);
}
