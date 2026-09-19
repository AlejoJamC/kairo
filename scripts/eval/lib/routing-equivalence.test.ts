// ---------------------------------------------------------------------------
// KAI-45 F0/F0b — the routing decision, pinned against real mail.
//
// `preFilterEmail` ran in all five ingestion paths and had exactly one test
// file: 43 cases built from inline object literals. Not one of them was a real
// message. So the rules were verified against the inputs someone imagined,
// never against the headers a Colombian logistics company's inbox actually
// carries — forwarded through a POP fetch, quoted-printable, Bcc-only, the
// tenant's address appearing twice in `To`.
//
// This file holds two tables over all 90 .eml in both corpora:
//
//   POLICY_1_0  what the pre-KAI-45 pre-filter answered, recorded by running it
//   EXPECTED    what the extracted layer answers now
//
// F0 was a pure refactor and the two were identical, which is what proved the
// extraction. F0b then removed one rule, and the diff between the tables is the
// entire behavioural change — enumerated, not summarised.
//
// From here the file is the regression suite for the policy. A rule added,
// removed or reordered must show up as a named diff and move
// `ROUTING_POLICY_VERSION` with it. That is the point of taking the rules out
// of eight early returns: a policy change stops being invisible.
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

/**
 * The verdict the pre-KAI-45 pre-filter gave each message. Written by running
 * it against these files, not by predicting it.
 *
 * Kept after F0b so the rule removal has something to be a diff against.
 */
const POLICY_1_0: Record<string, Record<string, string>> = {
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

/**
 * What the policy answers today. F0b (routing policy 1.1.0) removed the rule
 * that dropped mail from the tenant's own domain, so every `outbound` verdict
 * became `classify` and nothing else moved.
 */
const EXPECTED: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(POLICY_1_0).map(([corpus, rows]) => [
    corpus,
    Object.fromEntries(
      Object.entries(rows).map(([id, v]) => [id, v === 'outbound' ? 'classify' : v]),
    ),
  ]),
);

describe('routing policy — verdict per message', () => {
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

describe('routing policy — the F0b diff, enumerated', () => {
  const changed = Object.entries(POLICY_1_0).flatMap(([corpus, rows]) =>
    Object.keys(rows)
      .filter((id) => rows[id] !== EXPECTED[corpus]![id])
      .map((id) => `${corpus}/${id}: ${rows[id]} → ${EXPECTED[corpus]![id]}`),
  );

  it('changes exactly the 21 messages the removed rule was dropping', () => {
    expect(changed).toHaveLength(21);
    expect(changed.every((c) => c.includes('outbound → classify'))).toBe(true);
  });

  it('moves no message between two skip reasons', () => {
    for (const [corpus, rows] of Object.entries(POLICY_1_0)) {
      for (const [id, before] of Object.entries(rows)) {
        const after = EXPECTED[corpus]![id];
        if (before !== after) expect([before, after]).toEqual(['outbound', 'classify']);
      }
    }
  });

  it('reaches the model on 84 of the 90, up from 63', () => {
    const count = (table: typeof EXPECTED) =>
      Object.values(table).reduce(
        (n, rows) => n + Object.values(rows).filter((v) => v === 'classify').length,
        0,
      );
    expect(count(POLICY_1_0)).toBe(63);
    expect(count(EXPECTED)).toBe(84);
  });

  // The measurement that motivated F0b. `internal` is the class the KAI-93
  // report shows the models recognising ~90% of the time, and the old policy
  // removed most of it before any model was asked.
  it('takes `internal` from 2 of 10 reaching the classifier to 7 of 10', () => {
    const internalIds = ['131', '132', '133', '134', '135', '136', '137', '138', '139', '140'];
    const reaching = (table: typeof EXPECTED) =>
      internalIds.filter((id) => table['coverage']![id] === 'classify');

    expect(reaching(POLICY_1_0)).toEqual(['131', '136']);
    // 132, 133 and 140 come from the app's own notifier — still gated, as automated
    // senders rather than as same-domain mail.
    expect(reaching(EXPECTED)).toEqual(['131', '134', '135', '136', '137', '138', '139']);
  });
});
