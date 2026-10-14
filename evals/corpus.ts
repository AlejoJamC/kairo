import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CORPORA, type CorpusId } from '../scripts/eval/lib/corpus';
import { parseEml } from '../scripts/eval/lib/parse-eml';
import { tenantMailboxes } from '../scripts/eval/lib/eml-headers';
import { privatePath, readPrivate, root } from './private-files';
import type { EvalCase } from './cases';

/** The corpus tenant's private mailbox list; none when it is not configured, never an invented one. */
async function configuredMailboxes(): Promise<string[]> {
  try { return tenantMailboxes(); } catch { return []; }
}

/** Reuse the existing corpus locations and label adapters without modifying either. */
export async function loadCorpus(id: CorpusId, io: { read: (path: string) => Promise<string>; directory: (path: string) => Promise<string>;
  list: (path: string) => Promise<string[]>; mailboxes?: () => Promise<string[]> } = { read: readPrivate, directory: privatePath, list: (path: string) => readdir(path), mailboxes: configuredMailboxes }): Promise<EvalCase[]> {
  const corpus = CORPORA[id];
  const { parseCsv, adaptGroundTruth, canonicalEmailId } = await import('../scripts/eval/compute_metrics');
  const labels = adaptGroundTruth(parseCsv(await io.read(resolve(root, 'scripts/eval', corpus.groundTruth))));
  const directory = await io.directory(resolve(root, 'scripts/eval', corpus.emlDir));
  const files = (await io.list(directory)).filter(f => /^\d+\.eml$/.test(f));
  // Production always classifies with the connected mailbox; without it every sender reads as external.
  const mailboxes = io.mailboxes ? await io.mailboxes() : [];
  const rows: EvalCase[] = [];
  const ids = new Set<number>();
  for (const label of labels.rows) {
    const emailId = canonicalEmailId(label['email_id'] ?? '');
    if (!/^\d+$/.test(emailId) || ids.has(Number(emailId))) throw new Error('Invalid or duplicate corpus position');
    ids.add(Number(emailId));
    const file = files.find(f => canonicalEmailId(f.replace(/\.eml$/, '')) === emailId);
    if (!file) throw new Error('Missing corpus position');
    const raw = await io.read(resolve(directory, file));
    const email = parseEml(raw);
    const headers: Record<string, string> = {};
    for (const line of raw.split(/\r?\n\r?\n/, 1)[0]!.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator > 0) headers[line.slice(0, separator).toLowerCase()] ??= line.slice(separator + 1).trim();
    }
    const expected = Object.fromEntries(['type','priority','urgency','category','tone'].flatMap(key => {
      const value = label[key === 'type' ? 'ticket_type' : key];
      return value ? [[key, value]] : [];
    }));
    if (!Object.keys(expected).length) throw new Error('No labels for corpus position');
    rows.push({ id: Number(emailId), dataset: id, contract: 'onboarding_triage', subject: email.subject, body: email.body,
      from: email.from, to: email.to, cc: email.cc, headers, threadDepth: email.threadDepth, attachments: email.attachments,
      ...(mailboxes.length ? { mailbox: mailboxes[0], mailboxes } : {}),
      lang: process.env['EVAL_LANG'] === 'en' ? 'en' : 'es', expected,
      rubric: ['Decisions follow the current onboarding rubric and available evidence; missing context stays explicit.'] });
  }
  if (!rows.length) throw new Error('Empty corpus');
  return rows.sort((a,b) => a.id - b.id);
}
