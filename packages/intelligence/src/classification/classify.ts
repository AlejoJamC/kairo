import { createCompletionProvider } from '../config/providers';
import { ClassificationSchema, type ClassificationResult } from './schema';
import { buildPrompt, getPromptVersion, type PromptLang, DEFAULT_LANG } from './prompt';
import type { EmailMessage } from './types';
import type { CompletionMeta, CompletionOptions } from '../providers/base';

export interface ClassifyOptions extends Pick<CompletionOptions, 'temperature'> {
  lang?: PromptLang;
}

export async function classifyEmail(
  message: EmailMessage,
  options?: ClassifyOptions,
): Promise<ClassificationResult> {
  const { result } = await classifyEmailWithMeta(message, options);
  return result;
}

/**
 * Like {@link classifyEmail}, but also surfaces provider metadata (raw text,
 * model, token usage) and the resolved prompt — for LLM observability
 * (KAI-110).
 */
export async function classifyEmailWithMeta(
  message: EmailMessage,
  options?: ClassifyOptions,
): Promise<{ result: ClassificationResult; meta: CompletionMeta; prompt: string; promptVersion: string | null }> {
  const provider = createCompletionProvider();
  const lang = options?.lang ?? DEFAULT_LANG;

  const prompt = await buildPrompt(message, lang);
  const promptVersion = await getPromptVersion(lang);

  const { data, ...meta } = await provider.completeJSONWithMeta(prompt, ClassificationSchema, {
    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
  });

  return { result: data, meta, prompt, promptVersion };
}
