import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import type { PromptLang } from '../classification/prompt';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../prompts');

export type LlmFeatureErrorCode = 'template_missing' | 'placeholder_unfilled';

/**
 * A defect in how a feature calls the harness, not a provider failure: the
 * same call fails the same way every time, so it is never retried. Provider
 * failures stay `ProviderError`.
 */
export class LlmFeatureError extends Error {
  readonly code: LlmFeatureErrorCode;
  readonly retriable = false;

  constructor(code: LlmFeatureErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LlmFeatureError';
    this.code = code;
  }
}

const cache = new Map<string, string>();

/**
 * The versioned prompt `prompts/<promptId>/<lang>.md`.
 *
 * There is no fallback language: a tenant whose language has no rubric file is
 * a configuration error to surface, not a reason to answer in another language.
 */
export async function loadPromptTemplate(promptId: string, lang: PromptLang): Promise<string> {
  const key = `${promptId}/${lang}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let content: string;
  try {
    content = await readFile(join(PROMPTS_DIR, promptId, `${lang}.md`), 'utf-8');
  } catch (err) {
    throw new LlmFeatureError('template_missing', `prompt template ${key}.md not found`, { cause: err });
  }
  cache.set(key, content);
  return content;
}

/**
 * Extracts the prompt version from the first heading line, e.g.
 * `# Prompt de Clasificación de Emails (ES) — v1.0.0` → `1.0.0`.
 * Returns null if no version marker is present.
 */
export function extractPromptVersion(template: string): string | null {
  const match = template.match(/v(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Replaces every `{{name}}` with `vars[name]`.
 *
 * A placeholder with no value is an error, not a silent `{{name}}` sent to the
 * model: the prompt and the caller disagree about the contract, and the model
 * would answer a question nobody meant to ask.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  const missing = new Set<string>();
  const filled = template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = vars[name];
    if (value === undefined) {
      missing.add(name);
      return whole;
    }
    return value;
  });
  if (missing.size > 0) {
    throw new LlmFeatureError('placeholder_unfilled', `unfilled prompt placeholders: ${[...missing].join(', ')}`);
  }
  return filled;
}
