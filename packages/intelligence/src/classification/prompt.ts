import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { EmailMessage } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type PromptLang = 'es' | 'en' | 'pt';

export const SUPPORTED_LANGS: readonly PromptLang[] = ['es', 'en'] as const;
export const DEFAULT_LANG: PromptLang = 'es';

const cache = new Map<PromptLang, string>();

async function loadTemplate(lang: PromptLang): Promise<string> {
  const cached = cache.get(lang);
  if (cached) return cached;

  const promptPath = join(__dirname, `../../prompts/email-classification/${lang}.md`);
  const content = await readFile(promptPath, 'utf-8');
  cache.set(lang, content);
  return content;
}

export async function buildPrompt(
  message: EmailMessage,
  lang: PromptLang = DEFAULT_LANG,
): Promise<string> {
  const template = await loadTemplate(lang);

  return template
    .replaceAll('{{from}}', message.from)
    .replaceAll('{{subject}}', message.subject)
    .replaceAll('{{body}}', message.body);
}

/**
 * Extracts the prompt version from the first heading line, e.g.
 * `# Prompt de Clasificación de Emails (ES) — v1.0.0` → `1.0.0`.
 * Returns null if no version marker is present (KAI-110).
 */
export function extractPromptVersion(template: string): string | null {
  const match = template.match(/v(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

export async function getPromptVersion(lang: PromptLang = DEFAULT_LANG): Promise<string | null> {
  const template = await loadTemplate(lang);
  return extractPromptVersion(template);
}
