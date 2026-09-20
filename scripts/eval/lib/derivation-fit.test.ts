// ---------------------------------------------------------------------------
// KAI-45 F2 — the derivation table, fitted against the human labels.
//
// The sheet is the specification. KAI-100/KAI-101 produced it, KAI-102
// adjudicated it, the product owner confirmed it, and nothing in KAI-45 or
// KAI-54 reopens a single label. What this file checks is the other direction:
// whether `TYPE_DERIVATION` is even capable of producing what the humans wrote.
//
// It cannot check the full mapping, and says so plainly rather than pretending:
// `actionability` and `subject_matter` come from a model, the corpus has no
// column for them, and inventing one would be relabelling by another name.
//
// What it can check, with no model call and no annotation, is **reachability**.
// Provenance is computed from the envelope, so every email's row in the table is
// known. If the sheet assigns `support` to an email whose provenance row cannot
// produce `support` under any pair of axes, that table could never reproduce the
// sheet — the fit is impossible before a single token is spent, and the cause is
// a missing or badly defined axis, never a wrong label.
//
// This is the test that turns a taxonomy argument into something that fails red.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import {
  PROVENANCE,
  ACTIONABILITY,
  SUBJECT_MATTER,
  TICKET_TYPES,
  type Provenance,
  type TicketType,
} from '../../../packages/types/src/classification';
import {
  TYPE_DERIVATION,
  derivationKey,
  provenanceOf,
  reachableTypes,
} from '../../../packages/intelligence/src/classification/derive';
import { extractMailFacts } from '../../../apps/api/src/lib/email/mail-facts';
import { parseCsv, adaptGroundTruth, canonicalEmailId } from '../compute_metrics';
import { CORPORA, type Corpus } from './corpus';
import { readEmlHeaders, tenantMailboxes } from './eml-headers';
import { parseEml } from './parse-eml';

const EVAL_DIR = join(new URL('.', import.meta.url).pathname, '..');

// Read from scripts/eval/data/input/, which is gitignored: the corpus is a
// real company's inbox and the addresses that identify it stay with it.
const TENANT_MAILBOXES = tenantMailboxes();

interface Labelled {
  corpus: string;
  id: string;
  provenance: Provenance;
  label: TicketType;
}

/**
 * Every corpus email with the label the humans gave it and the provenance the
 * envelope gives it. `adaptGroundTruth` collapses both sheet schemas — the raw
 * two-annotator export and the already-canonical one — onto the same columns.
 */
function labelled(corpus: Corpus): Labelled[] {
  const sheet = adaptGroundTruth(
    parseCsv(readFileSync(join(EVAL_DIR, corpus.groundTruth), 'utf-8')),
  );
  const byId = new Map<string, string>();
  for (const row of sheet.rows) {
    byId.set(canonicalEmailId(row['email_id'] ?? ''), row['ticket_type'] ?? '');
  }

  const out: Labelled[] = [];
  for (const file of readdirSync(join(EVAL_DIR, corpus.emlDir)).filter((f) => f.endsWith('.eml'))) {
    const id = file.replace(/\.eml$/, '');
    const label = byId.get(canonicalEmailId(id));
    if (!label) continue;
    const raw = readFileSync(join(EVAL_DIR, corpus.emlDir, file), 'utf-8');
    const parsed = parseEml(raw);
    const facts = extractMailFacts({
      from: parsed.from,
      subject: parsed.subject,
      headers: readEmlHeaders(raw),
      tenantMailbox: TENANT_MAILBOXES,
    });
    out.push({
      corpus: corpus.id,
      id,
      provenance: provenanceOf(facts),
      label: label as TicketType,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const CORPUS_EMAILS = [...labelled(CORPORA.coverage), ...labelled(CORPORA.main)];

describe('derivation table — shape', () => {
  it('has an entry for every combination, so nothing can resolve to undefined', () => {
    const missing: string[] = [];
    for (const p of PROVENANCE) {
      for (const a of ACTIONABILITY) {
        for (const s of SUBJECT_MATTER) {
          const key = derivationKey(p, a, s);
          if (!(key in TYPE_DERIVATION)) missing.push(key);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(Object.keys(TYPE_DERIVATION)).toHaveLength(
      PROVENANCE.length * ACTIONABILITY.length * SUBJECT_MATTER.length,
    );
  });

  it('emits only types the persisted contract allows', () => {
    for (const type of Object.values(TYPE_DERIVATION)) {
      expect(TICKET_TYPES).toContain(type);
    }
  });

  // `spam` is answered by `X-Spam-Status` in the routing policy, before this
  // table runs. It has to be: an unsolicited vendor offer and a phishing
  // attempt are both "commercial, no action needed", so no pair of axes
  // separates them.
  it('never produces `spam`, which the envelope answers first', () => {
    expect(Object.values(TYPE_DERIVATION)).not.toContain('spam');
  });
});

describe('derivation table — fit against the 90 human labels', () => {
  it('reads a provenance and a label for all 90 corpus emails', () => {
    expect(CORPUS_EMAILS).toHaveLength(90);
  });

  // The constraint that matters, and the only one checkable without inventing
  // axis values the corpus does not carry.
  it('every label the sheet assigns is reachable from that email provenance row', () => {
    const unreachable = CORPUS_EMAILS.filter(
      (e) => e.label !== 'spam' && !reachableTypes(e.provenance).has(e.label),
    ).map((e) => `${e.corpus}/${e.id}: ${e.provenance} cannot produce "${e.label}"`);

    expect(unreachable).toEqual([]);
  });

  // Stated as a table so a cell edit that quietly drops a type from a row shows
  // up here as the row it broke, not as a count.
  it('each provenance row covers the four types its emails actually carry', () => {
    const needed: Record<string, Set<TicketType>> = {};
    for (const e of CORPUS_EMAILS) {
      if (e.label === 'spam') continue; // routed, never derived
      (needed[e.provenance] ??= new Set()).add(e.label);
    }

    for (const [provenance, types] of Object.entries(needed)) {
      const reachable = reachableTypes(provenance as Provenance);
      for (const type of types) {
        expect(`${provenance} → ${type}: ${reachable.has(type)}`).toBe(
          `${provenance} → ${type}: true`,
        );
      }
    }
  });

  // Documents what the fit is actually working against, so the next person does
  // not have to rerun the analysis to know why the table looks the way it does.
  it('the corpus splits across provenance the way the table assumes', () => {
    const count = (p: Provenance) => CORPUS_EMAILS.filter((e) => e.provenance === p).length;
    expect(count('external')).toBe(63);
    expect(count('tenant_mailbox')).toBe(23);
    // Corporate addresses that are not themselves connected inboxes:
    // gerencia@, operacioneslog@ and the like.
    expect(count('same_company')).toBe(4);
  });

  // Reading one mailbox instead of four moved 26 of the 90 into the wrong row.
  // Provenance is a coordinate of the derivation key, so that is 26 messages
  // looked up in the wrong place before anyone even asks the model.
  it('every type each row must reach is reachable, row by row', () => {
    const needed = (p: Provenance) =>
      [...new Set(CORPUS_EMAILS.filter((e) => e.provenance === p && e.label !== 'spam').map((e) => e.label))].sort();

    expect(needed('external')).toEqual(['internal', 'other', 'prospect', 'support']);
    expect(needed('tenant_mailbox')).toEqual(['internal', 'other', 'prospect', 'support']);
    expect(needed('same_company')).toEqual(['internal', 'support']);
  });

  // The ten flagged messages are the reason `spam` is excluded above: all of
  // them are external, so without the routing rule the external row would have
  // to produce five types from six cells while two of them are semantically
  // identical to the model.
  it('every `spam` label in the corpus is external mail the envelope already flagged', () => {
    const spam = CORPUS_EMAILS.filter((e) => e.label === 'spam');
    expect(spam).toHaveLength(10);
    expect(spam.every((e) => e.provenance === 'external')).toBe(true);
  });
});
