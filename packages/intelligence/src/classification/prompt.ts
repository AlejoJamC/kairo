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

// A field the caller could not supply is not the same as an empty one: the
// prompt says so explicitly, so the model lowers confidence rather than
// inventing a value it cannot see.
const UNAVAILABLE: Record<PromptLang, string> = {
  es: '(no disponible)',
  en: '(not available)',
  pt: '(indisponível)',
};

function renderAttachments(
  attachments: EmailMessage['attachments'],
  unavailable: string,
): string {
  if (attachments === undefined) return unavailable;
  if (attachments.length === 0) return '—';
  return attachments
    .map((a) => `${a.filename} (${a.contentType})`)
    .join(', ');
}

export async function buildPrompt(
  message: EmailMessage,
  lang: PromptLang = DEFAULT_LANG,
): Promise<string> {
  const template = await loadTemplate(lang);
  const na = UNAVAILABLE[lang];

  return template
    .replaceAll('{{from}}', message.from)
    .replaceAll('{{to}}', message.to ?? na)
    .replaceAll('{{tenant_mailbox}}', message.tenantMailbox ?? na)
    .replaceAll('{{business_context}}', message.businessContext ?? na)
    .replaceAll('{{cc}}', message.cc ?? na)
    .replaceAll('{{subject}}', message.subject)
    .replaceAll(
      '{{thread_depth}}',
      message.threadDepth === undefined ? na : String(message.threadDepth),
    )
    .replaceAll('{{attachments}}', renderAttachments(message.attachments, na))
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
