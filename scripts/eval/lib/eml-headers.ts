// ---------------------------------------------------------------------------
// KAI-45 — the raw header block of an .eml, and who the corpus tenant is.
//
// `parseEml` returns the fields the classifier prompt renders (from, to, cc,
// body, thread depth, attachments) but not the header record, and
// `extractMailFacts` needs the record: the spam verdict, the authentication
// result and the bulk markers all live in headers nobody was reading.
//
// `readEmlHeaders` mirrors `headersToRecord` in apps/api/src/lib/email/
// headers.ts — original case preserved, last occurrence of a repeated header
// wins — so a fact read from a file here and the same fact read from Gmail's
// API in production come from the same shape. What differs is the transport,
// not the record.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const SCRIPT_DIR = join(new URL('.', import.meta.url).pathname, '..');

/**
 * Where the tenant's mailboxes are configured.
 *
 * `scripts/eval/data/` is gitignored: the corpus is a real company's inbox, and
 * the addresses that identify it belong there with it, never in tracked source.
 * Same arrangement `business_context.txt` already uses, for the same reason.
 */
const MAILBOXES_FILE = join(SCRIPT_DIR, 'data/input/tenant_mailboxes.txt');

/**
 * Every mailbox the corpus tenant reads, as `support_channels` would hold them.
 *
 * A list, not one address. An account is not one inbox — the one this corpus
 * comes from aggregates several by POP across more than one domain — and
 * comparing against a single address read six of the ninety messages as
 * `external` when they came from the company itself. Provenance is a coordinate
 * of the derivation key, so a wrong one looks the message up in the wrong row.
 *
 * `EVAL_TENANT_MAILBOX` overrides the file with a single address, which is how
 * a run against some other inbox is configured.
 */
export function tenantMailboxes(): string[] {
  const override = process.env['EVAL_TENANT_MAILBOX']?.trim();
  if (override) return [override.toLowerCase()];

  if (!existsSync(MAILBOXES_FILE)) {
    throw new Error(
      `${MAILBOXES_FILE} is missing. It holds the corpus tenant's mailboxes, one per ` +
        `line, and lives beside the corpus because both are private. Set ` +
        `EVAL_TENANT_MAILBOX to run against a single address instead.`,
    );
  }

  const lines = readFileSync(MAILBOXES_FILE, 'utf-8')
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l !== '' && !l.startsWith('#'));

  if (lines.length === 0) {
    throw new Error(`${MAILBOXES_FILE} is empty. Provenance cannot be computed without it.`);
  }
  return [...new Set(lines)];
}

/** The header block as a record. Folded continuation lines are rejoined. */
export function readEmlHeaders(raw: string): Record<string, string> {
  const head = raw.split(/\r?\n\r?\n/)[0] ?? '';
  const out: Record<string, string> = {};
  let key = '';
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && key) {
      out[key] += ' ' + line.trim();
      continue;
    }
    const match = line.match(/^([A-Za-z0-9-]+):[ \t]*(.*)$/);
    if (!match) continue;
    key = match[1]!;
    out[key] = match[2]!;
  }
  return out;
}
