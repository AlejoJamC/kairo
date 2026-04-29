import { createCompletionProvider } from '../config/providers';
import { ClassificationSchema, type ClassificationResult } from './schema';
import { buildPrompt, type PromptLang, DEFAULT_LANG } from './prompt';
import type { EmailMessage } from './types';
import type { CompletionOptions } from '../providers/base';

export interface ClassifyOptions extends Pick<CompletionOptions, 'temperature'> {
  lang?: PromptLang;
}

export async function classifyEmail(
  message: EmailMessage,
  options?: ClassifyOptions,
): Promise<ClassificationResult> {
  const provider = createCompletionProvider();
  const lang = options?.lang ?? DEFAULT_LANG;

  const prompt = await buildPrompt(message, lang);

  return provider.completeJSON(prompt, ClassificationSchema, {
    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
  });
}
