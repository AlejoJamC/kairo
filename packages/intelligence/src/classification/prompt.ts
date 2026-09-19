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

// ---------------------------------------------------------------------------
// KAI-45 — the envelope, stated rather than inferred.
//
// The rubric used to spend paragraphs asking the model to work out from prose
// whether `De` and `Para` were the same mailbox (es.md:44), whether a message
// came from the house or from outside, whether it looked automated. Every one
// of those was a string comparison apps/api had already done and thrown away.
//
// Stating them costs ~60 tokens and removes ~25 lines of rules. Two properties
// matter and are load-bearing:
//
//   - A fact that is not known is OMITTED, never rendered as a negative. "the
//     provider did not scan this" and "the provider says it is clean" are
//     different, and a rubric that conflates them teaches the model to trust a
//     header nobody fetched.
//   - The block says nothing about what the facts IMPLY. Provenance does not
//     decide `internal`: on the KAI-93 coverage corpus the eleven messages sent
//     between the company's own mailboxes carry three different labels. The
//     envelope is evidence, and the rubric still does the deciding.
// ---------------------------------------------------------------------------

type FactLabels = {
  heading: string;
  sender: string;
  senderIsTenant: string;
  senderIsSameCompany: string;
  senderIsExternal: string;
  recipients: string;
  tenantAmongRecipients: string;
  spam: string;
  spamPositive: (score: number | null) => string;
  spamNegative: string;
  bulk: string;
  automated: string;
  auth: string;
  authPass: string;
  authFail: string;
  yes: string;
  no: string;
};

const FACT_LABELS: Record<PromptLang, FactLabels> = {
  es: {
    heading:
      'Hechos del sobre, verificados por el sistema. No los deduzcas ni los contradigas; ' +
      'lo que no aparece aquí es que no se sabe, no que sea falso:',
    sender: 'Remitente',
    senderIsTenant: 'la misma casilla que Kairo lee',
    senderIsSameCompany: 'otra casilla de la misma empresa',
    senderIsExternal: 'ajeno a la empresa',
    recipients: 'Destinatarios',
    tenantAmongRecipients: 'La casilla que Kairo lee está entre los destinatarios',
    spam: 'Filtro de spam del proveedor',
    spamPositive: (score) => (score === null ? 'positivo' : `positivo (puntaje ${score})`),
    spamNegative: 'negativo',
    bulk: 'Envío masivo',
    automated: 'Remitente automático',
    auth: 'Autenticación del remitente',
    authPass: 'correcta',
    authFail: 'fallida',
    yes: 'sí',
    no: 'no',
  },
  en: {
    heading:
      'Envelope facts, verified by the system. Do not infer or contradict them; ' +
      'anything missing here is unknown, not false:',
    sender: 'Sender',
    senderIsTenant: 'the same mailbox Kairo reads',
    senderIsSameCompany: 'another mailbox of the same company',
    senderIsExternal: 'outside the company',
    recipients: 'Recipients',
    tenantAmongRecipients: 'The mailbox Kairo reads is among the recipients',
    spam: "Provider's spam filter",
    spamPositive: (score) => (score === null ? 'positive' : `positive (score ${score})`),
    spamNegative: 'negative',
    bulk: 'Bulk mailing',
    automated: 'Automated sender',
    auth: 'Sender authentication',
    authPass: 'pass',
    authFail: 'fail',
    yes: 'yes',
    no: 'no',
  },
  pt: {
    heading:
      'Fatos do envelope, verificados pelo sistema. Não os deduza nem os contradiga; ' +
      'o que não aparece aqui é desconhecido, não falso:',
    sender: 'Remetente',
    senderIsTenant: 'a mesma caixa que o Kairo lê',
    senderIsSameCompany: 'outra caixa da mesma empresa',
    senderIsExternal: 'externo à empresa',
    recipients: 'Destinatários',
    tenantAmongRecipients: 'A caixa que o Kairo lê está entre os destinatários',
    spam: 'Filtro de spam do provedor',
    spamPositive: (score) => (score === null ? 'positivo' : `positivo (pontuação ${score})`),
    spamNegative: 'negativo',
    bulk: 'Envio em massa',
    automated: 'Remetente automático',
    auth: 'Autenticação do remetente',
    authPass: 'correta',
    authFail: 'falhou',
    yes: 'sim',
    no: 'não',
  },
};

/**
 * The envelope block, or an empty string when the caller had no facts to give —
 * the three call sites that reclassify a stored ticket have no headers to read,
 * and an empty block is more honest than a block full of unknowns.
 */
function renderFacts(facts: EmailMessage['facts'], lang: PromptLang): string {
  if (!facts) return '';
  const l = FACT_LABELS[lang];
  const bool = (v: boolean) => (v ? l.yes : l.no);
  const lines: string[] = [];

  lines.push(
    `- ${l.sender}: ${
      facts.senderIsTenantAddress
        ? l.senderIsTenant
        : facts.senderIsTenantDomain
          ? l.senderIsSameCompany
          : l.senderIsExternal
    }`,
  );

  // 0 means neither To nor Cc arrived, which is unknown rather than "nobody".
  if (facts.recipientCount > 0) {
    lines.push(`- ${l.recipients}: ${facts.recipientCount}`);
    lines.push(`- ${l.tenantAmongRecipients}: ${bool(facts.tenantInRecipients)}`);
  }

  if (facts.spamFiltered !== null) {
    lines.push(
      `- ${l.spam}: ${facts.spamFiltered ? l.spamPositive(facts.spamScore) : l.spamNegative}`,
    );
  }

  lines.push(`- ${l.bulk}: ${bool(facts.isBulk)}`);
  lines.push(`- ${l.automated}: ${bool(facts.isAutomatedSender)}`);

  if (facts.authResult !== null && facts.authResult !== 'none') {
    lines.push(`- ${l.auth}: ${facts.authResult === 'pass' ? l.authPass : l.authFail}`);
  }

  return `${l.heading}\n${lines.join('\n')}`;
}

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
    // The block is optional, so it takes its own surrounding blank lines with
    // it when there is nothing to say — a caller with no headers should get the
    // prompt as it read before KAI-45, not one with a hole in it.
    .replace(
      /\n*\{\{envelope_facts\}\}\n*/,
      () => {
        const block = renderFacts(message.facts, lang);
        return block ? `\n\n${block}\n\n` : '\n';
      },
    )
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
