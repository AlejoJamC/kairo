// ---------------------------------------------------------------------------
// KAI-45 F0 — the routing decision, pinned against real mail.
//
// `preFilterEmail` ran in all five ingestion paths and had exactly one test
// file: 43 cases built from inline object literals. Not one of them was a real
// message. So the rules were verified against the inputs someone imagined,
// never against the headers a Colombian logistics company's inbox actually
// carries — forwarded through a POP fetch, quoted-printable, Bcc-only, the
// tenant's address appearing twice in `To`.
//
// This holds the extracted layer (mail-facts.ts + routing-policy.ts) against
// all 90 .eml in both corpora. It was written by running the pre-KAI-45
// `preFilterEmail` over the same 90 files and recording its verdict: the table
// below IS the old behaviour, so a green run is the equivalence proof for the
// refactor.
//
// Once F0 is in, its job changes: it becomes the regression suite for the
// routing policy. A rule that is added, removed or reordered must show up here
// as an enumerated diff, one email at a time, and `ROUTING_POLICY_VERSION`
// moves with it. That is the whole point of taking the rules out of eight
// early returns — a policy change stops being invisible.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { extractMailFacts } from '../../../apps/api/src/lib/email/mail-facts';
import { resolveRoute } from '../../../apps/api/src/lib/email/routing-policy';
import { CORPORA } from './corpus';
import { parseEml } from './parse-eml';

const SCRIPT_DIR = join(new URL('.', import.meta.url).pathname, '..');

// Read from scripts/eval/data/input/tenant_mailboxes.txt, which is gitignored
// along with the corpus: the mailbox that identifies the tenant lives with the
// data, never in tracked source. First line is the monitored inbox.
const TENANT_MAILBOX = readFileSync(join(SCRIPT_DIR, 'data/input/tenant_mailboxes.txt'), 'utf-8')
  .split('\n')
  .map((l) => l.trim().toLowerCase())
  .filter((l) => l !== '' && !l.startsWith('#'))[0]!;

/**
 * The raw header block as a record, mirroring `headersToRecord` in
 * apps/api/src/lib/email/headers.ts: original case preserved, last occurrence
 * of a repeated header wins. Folded continuation lines are rejoined first.
 *
 * Production gets this record from Gmail's API rather than from a file, so what
 * is reproduced here is the shape, not the transport.
 */
function readHeaders(raw: string): Record<string, string> {
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

/** `skip_reason`, or `classify` when the message reaches the model. */
function verdict(corpusEmlDir: string, filename: string): string {
  const raw = readFileSync(join(SCRIPT_DIR, corpusEmlDir, filename), 'utf-8');
  const parsed = parseEml(raw);
  const route = resolveRoute(
    extractMailFacts({
      from: parsed.from,
      subject: parsed.subject,
      headers: readHeaders(raw),
      tenantMailbox: TENANT_MAILBOX,
    }),
  );
  return route.kind === 'skip' ? route.reason : 'classify';
}

function emlFiles(corpusEmlDir: string): string[] {
  return readdirSync(join(SCRIPT_DIR, corpusEmlDir))
    .filter((f) => f.endsWith('.eml'))
    .sort();
}

// The verdict the pre-KAI-45 pre-filter gave each message. Written by running
// it; not by predicting it.
const EXPECTED: Record<string, Record<string, string>> = {
  main: {
    '001': 'outbound',  '002': 'classify', '003': 'classify', '004': 'outbound', '005': 'outbound',
    '006': 'classify',  '007': 'classify', '008': 'classify', '009': 'classify', '010': 'outbound',
    '011': 'classify',  '012': 'classify', '013': 'classify', '014': 'classify', '015': 'classify',
    '016': 'classify',  '017': 'classify', '018': 'classify', '019': 'classify', '020': 'classify',
    '021': 'classify',  '022': 'classify', '023': 'classify', '024': 'outbound', '025': 'outbound',
    '026': 'classify',  '027': 'classify', '028': 'classify', '029': 'classify', '030': 'classify',
    '031': 'classify',  '032': 'classify', '033': 'classify', '034': 'classify', '035': 'outbound',
    '036': 'classify',  '037': 'classify', '038': 'classify', '039': 'classify', '040': 'classify',
    '041': 'classify',  '042': 'classify', '043': 'classify', '044': 'classify', '045': 'classify',
    '046': 'classify',  '047': 'classify', '048': 'classify', '049': 'classify', '050': 'classify',
  },
  coverage: {
    '101': 'outbound', '102': 'outbound',         '103': 'classify',         '104': 'outbound', '105': 'classify',
    '106': 'outbound', '107': 'mailing_list',     '108': 'outbound',         '109': 'classify', '110': 'outbound',
    '111': 'classify', '112': 'classify',         '113': 'classify',         '114': 'classify', '115': 'mailing_list',
    '116': 'classify', '117': 'classify',         '118': 'classify',         '119': 'classify', '120': 'classify',
    '121': 'classify', '122': 'outbound',         '123': 'classify',         '124': 'classify', '125': 'outbound',
    '126': 'classify', '127': 'outbound',         '128': 'mailing_list',     '129': 'classify', '130': 'classify',
    '131': 'classify', '132': 'automated_sender', '133': 'automated_sender', '134': 'outbound', '135': 'outbound',
    '136': 'classify', '137': 'outbound',         '138': 'outbound',         '139': 'outbound', '140': 'automated_sender',
  },
};

describe('routing policy — equivalence with the pre-KAI-45 pre-filter', () => {
  for (const corpus of [CORPORA.main, CORPORA.coverage]) {
    const expected = EXPECTED[corpus.id]!;

    describe(corpus.id, () => {
      it('covers every .eml in the corpus, with nothing left over', () => {
        const ids = emlFiles(corpus.emlDir).map((f) => f.replace(/\.eml$/, ''));
        expect(ids).toEqual(Object.keys(expected).sort());
      });

      for (const [id, want] of Object.entries(expected)) {
        it(`${id} → ${want}`, () => {
          expect(verdict(corpus.emlDir, `${id}.eml`)).toBe(want);
        });
      }
    });
  }
});

describe('routing policy — what the gate does to the corpus', () => {
  // Stated as counts so a rule change shows its blast radius in one number
  // before anyone reads 90 individual cases.
  function tally(corpusId: 'main' | 'coverage'): Record<string, number> {
    const out: Record<string, number> = {};
    for (const want of Object.values(EXPECTED[corpusId]!)) out[want] = (out[want] ?? 0) + 1;
    return out;
  }

  it('drops 21 of the 90 as same-domain mail the tenant received', () => {
    expect(tally('main')['outbound']).toBe(7);
    expect(tally('coverage')['outbound']).toBe(14);
  });

  it('reaches the model on 63 of the 90 — 21 same-domain, 3 lists and 3 automated are gated', () => {
    expect(tally('main')['classify']! + tally('coverage')['classify']!).toBe(63);
  });

  // The measurement that motivates F0b: `internal` is the class the KAI-93
  // report shows the models recognising ~90% of the time, and the gate removes
  // most of it before any model is asked.
  it('removes 8 of the 10 ground-truth `internal` emails before the classifier', () => {
    const internalIds = ['131', '132', '133', '134', '135', '136', '137', '138', '139', '140'];
    const reaching = internalIds.filter((id) => EXPECTED['coverage']![id] === 'classify');
    expect(reaching).toEqual(['131', '136']);
  });
});
