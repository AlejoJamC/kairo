import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CORPORA, type CorpusId } from '../scripts/eval/lib/corpus';
import { parseEml } from '../scripts/eval/lib/parse-eml';
import { privatePath, readPrivate, root } from './private-files';
import type { EvalCase } from './cases';

/** Reuse the existing corpus locations and label adapters without modifying either. */
export async function loadCorpus(id: CorpusId): Promise<EvalCase[]> {
  const corpus = CORPORA[id];
  const { parseCsv, adaptGroundTruth, canonicalEmailId } = await import('../scripts/eval/compute_metrics');
  const labels = adaptGroundTruth(parseCsv(await readPrivate(resolve(root, 'scripts/eval', corpus.groundTruth))));
  const directory = await privatePath(resolve(root, 'scripts/eval', corpus.emlDir));
  const files = (await readdir(directory)).filter(f => /^\d+\.eml$/.test(f));
  const mailbox = process.env['EVAL_TENANT_MAILBOX'];
  if (!mailbox) throw new Error('EVAL_TENANT_MAILBOX required');
  const rows: EvalCase[] = [];
  const ids = new Set<number>();
  for (const label of labels.rows) {
    const emailId = canonicalEmailId(label['email_id'] ?? '');
    if (!/^\d+$/.test(emailId) || ids.has(Number(emailId))) throw new Error('Invalid or duplicate corpus position');
    ids.add(Number(emailId));
    const file = files.find(f => canonicalEmailId(f.replace(/\.eml$/, '')) === emailId);
    if (!file) throw new Error('Missing corpus position');
    const email = parseEml(await readPrivate(resolve(directory, file)));
    const expected = Object.fromEntries(['type','priority','urgency','category','tone'].flatMap(key => {
      const value = label[key === 'type' ? 'ticket_type' : key];
      return value ? [[key, value]] : [];
    }));
    if (!Object.keys(expected).length) throw new Error('No labels for corpus position');
    rows.push({ id: Number(emailId), dataset: id, contract: 'onboarding_triage', subject: email.subject, body: email.body,
      from: email.from, to: email.to, cc: email.cc, threadDepth: email.threadDepth, attachments: email.attachments,
      mailbox, lang: process.env['EVAL_LANG'] === 'en' ? 'en' : 'es', expected,
      rubric: ['Decisions follow the current onboarding rubric and available evidence; missing context stays explicit.'] });
  }
  if (!rows.length) throw new Error('Empty corpus');
  return rows.sort((a,b) => a.id - b.id);
}
