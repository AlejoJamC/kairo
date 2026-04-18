import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { EmailMessage } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Allowed values ────────────────────────────────────────────────────────
// Source of truth: the YAML frontmatter in email-classification.md
// Edit that file — never edit these types by hand.

export interface AllowedValues {
  tipo: readonly [string, ...string[]];
  prioridad: readonly [string, ...string[]];
  categoria: readonly [string, ...string[]];
  tono: readonly [string, ...string[]];
  urgencia: readonly [string, ...string[]];
}

export interface ParsedPrompt {
  template: string;
  allowed: AllowedValues;
}

// ─── Cache ─────────────────────────────────────────────────────────────────

let cache: ParsedPrompt | null = null;

// ─── Frontmatter parser ────────────────────────────────────────────────────

function parseAllowedList(frontmatter: string, key: string): [string, ...string[]] {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const match = frontmatter.match(pattern);
  if (!match?.[1]) {
    throw new Error(
      `email-classification.md: missing frontmatter key "${key}". ` +
      `Add a line: ${key}: value1, value2, ...`
    );
  }
  const parts = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`email-classification.md: "${key}" has no values`);
  }
  return parts as [string, ...string[]];
}

function buildJsonExample(allowed: AllowedValues): string {
  const example = {
    tipo: allowed.tipo.join(' | '),
    prioridad: allowed.prioridad.join(' | '),
    categoria: allowed.categoria.join(' | '),
    tono: allowed.tono.join(' | '),
    urgencia: allowed.urgencia.join(' | '),
    razonamiento: 'string explaining the decision (50–200 chars)',
    confianza: 0.95,
  };
  return '```json\n' + JSON.stringify(example, null, 2) + '\n```';
}

async function loadAndParse(): Promise<ParsedPrompt> {
  if (cache) return cache;

  const promptPath = join(__dirname, '../../prompts/email-classification.md');
  const fileContent = await readFile(promptPath, 'utf-8');

  // Split frontmatter from body
  const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch?.[1] || !fmMatch?.[2]) {
    throw new Error('email-classification.md: malformed YAML frontmatter — expected ---...--- block');
  }

  const frontmatter = fmMatch[1];
  const rawBody = fmMatch[2].trim();

  const allowed: AllowedValues = {
    tipo: parseAllowedList(frontmatter, 'allowed_tipo'),
    prioridad: parseAllowedList(frontmatter, 'allowed_prioridad'),
    categoria: parseAllowedList(frontmatter, 'allowed_categoria'),
    tono: parseAllowedList(frontmatter, 'allowed_tono'),
    urgencia: parseAllowedList(frontmatter, 'allowed_urgencia'),
  };

  // Inject allowed value lists and auto-generated JSON example into the body
  const template = rawBody
    .replace('{{allowed_tipo}}', allowed.tipo.join(', '))
    .replace('{{allowed_prioridad}}', allowed.prioridad.join(', '))
    .replace('{{allowed_categoria}}', allowed.categoria.join(', '))
    .replace('{{allowed_tono}}', allowed.tono.join(', '))
    .replace('{{allowed_urgencia}}', allowed.urgencia.join(', '))
    .replace('{{json_example}}', buildJsonExample(allowed));

  cache = { template, allowed };
  return cache;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function loadPrompt(): Promise<ParsedPrompt> {
  return loadAndParse();
}

export async function buildPrompt(message: EmailMessage): Promise<string> {
  const { template } = await loadAndParse();

  return template
    .replaceAll('{{from}}', message.from)
    .replaceAll('{{subject}}', message.subject)
    .replaceAll('{{body}}', message.body);
}
