import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { EmailMessage } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let promptTemplateCache: string | null = null;

async function loadPromptTemplate(): Promise<string> {
  if (promptTemplateCache) return promptTemplateCache;

  const promptPath = join(__dirname, '../../prompts/email-classification.md');
  const fileContent = await readFile(promptPath, 'utf-8');

  const withoutFrontmatter = fileContent.replace(/^---\n[\s\S]*?\n---\n/, '');
  promptTemplateCache = withoutFrontmatter.trim();

  return promptTemplateCache;
}

/**
 * Build classification prompt by injecting email data into template
 */
export async function buildPrompt(message: EmailMessage): Promise<string> {
  const template = await loadPromptTemplate();

  return template
    .replaceAll('{{from}}', message.from)
    .replaceAll('{{subject}}', message.subject)
    .replaceAll('{{body}}', message.body);
}
