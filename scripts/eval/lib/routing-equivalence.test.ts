// ---------------------------------------------------------------------------
// KAI-45 F0/F0b/F2 — the routing decision, pinned against real mail.
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
// extraction. Every later policy version is a diff against that table,
// enumerated one message at a time rather than summarised:
//
//   2.0.0 (F0b)  the same-domain rule removed — 21 messages, all to `classify`
//   3.0.0 (F2)   the provider's spam verdict decides first — 10 messages
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
import { readEmlHeaders, tenantMailboxes } from './eml-headers';
import { parseEml } from './parse-eml';

// Read from scripts/eval/data/input/, which is gitignored: the corpus is a
// real company's inbox and the addresses that identify it stay with it.
const TENANT_MAILBOXES = tenantMailboxes();

const SCRIPT_DIR = join(new URL('.', import.meta.url).pathname, '..');



/** `skip_reason`, or `classify` when the message reaches the model. */
function verdict(corpusEmlDir: string, filename: string): string {
  const raw = readFileSync(join(SCRIPT_DIR, corpusEmlDir, filename), 'utf-8');
  const parsed = parseEml(raw);
  const route = resolveRoute(
    extractMailFacts({
      from: parsed.from,
      subject: parsed.subject,
      headers: readEmlHeaders(raw),
      tenantMailbox: TENANT_MAILBOXES,
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
 * The ten messages the receiving server itself flagged. `X-Spam-Status: Yes`
 * fires on exactly these and on nothing else across all 90 files, which is what
 * lets routing policy 1.1.1 answer `spam` without spending a token.
 */
const SPAM_FILTERED = ['111', '112', '113', '114', '115', '116', '117', '118', '119', '120'];

/**
 * What the policy answers today, derived from POLICY_1_0 by the two rule
 * changes rather than retyped — so a table that drifts from the rules it claims
 * to describe cannot go unnoticed.
 *
 *   2.0.0 — the same-domain rule is gone: every `outbound` becomes `classify`.
 *   3.0.0 — the provider's spam verdict runs first: the ten flagged messages
 *           become `spam_filtered` whatever they answered before (115 was
 *           `mailing_list`, the rest `classify`).
 *   4.0.0 — `mailing_list` is gone, so what it held becomes `classify`; and
 *           `automated_sender` stops firing on the account's own mailboxes,
 *           which is what 132, 133 and 140 are.
 */

/**
 * The account's own notifier writing into the account's own inbox.
 *
 * Listed rather than derived because it is a property of these three messages,
 * not of the table: `isAutomatedSender` is true for all of them and so is
 * `senderIsTenantAddress`, and the second is what rule 3 now reads.
 */
const TENANT_OWN_ROBOT = ['132', '133', '140'];
const EXPECTED: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(POLICY_1_0).map(([corpus, rows]) => [
    corpus,
    Object.fromEntries(
      Object.entries(rows).map(([id, v]) => [
        id,
        corpus === 'coverage' && SPAM_FILTERED.includes(id)
          ? 'spam_filtered'
          : v === 'outbound' || v === 'mailing_list'
            ? 'classify'
            : v === 'automated_sender' && corpus === 'coverage' && TENANT_OWN_ROBOT.includes(id)
              ? 'classify'
              : v,
      ]),
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

describe('routing policy — every change since 1.0.0, enumerated', () => {
  const changes = Object.entries(POLICY_1_0).flatMap(([corpus, rows]) =>
    Object.keys(rows)
      .filter((id) => rows[id] !== EXPECTED[corpus]![id])
      .map((id) => ({ corpus, id, from: rows[id]!, to: EXPECTED[corpus]![id]! })),
  );

  it('moves 36 of the 90 messages, and only in the ways the rules describe', () => {
    expect(changes).toHaveLength(36);
    const transitions = [...new Set(changes.map((c) => `${c.from} → ${c.to}`))].sort();
    expect(transitions).toEqual([
      'automated_sender → classify',
      'classify → spam_filtered',
      'mailing_list → classify',
      'mailing_list → spam_filtered',
      'outbound → classify',
    ]);
  });

  // 2.0.0 — the same-domain rule. Named `outbound`, it never detected outbound:
  // this pipeline only reads an inbox. What it dropped was the company's own
  // mail that arrived.
  it('2.0.0 stops dropping 21 same-domain messages', () => {
    const undropped = changes.filter((c) => c.from === 'outbound');
    expect(undropped).toHaveLength(21);
    expect(undropped.every((c) => c.to === 'classify')).toBe(true);
  });

  // 3.0.0 — the provider's own verdict, ahead of everything. It also reclaims
  // 115, which used to be reported as a mailing list because List-Unsubscribe
  // was checked before anyone asked whether the server had already decided.
  it('3.0.0 answers the ten flagged messages from the envelope', () => {
    const flagged = changes.filter((c) => c.to === 'spam_filtered').map((c) => c.id);
    expect(flagged.sort()).toEqual([...SPAM_FILTERED].sort());
    expect(changes.find((c) => c.id === '115')!.from).toBe('mailing_list');
  });

  // 4.0.0 — the two rules that were dropping mail the ground truth gives a type
  // to. `mailing_list` is gone entirely, and `automated_sender` stopped firing
  // on the account's own mailboxes.
  it('4.0.0 stops dropping the five messages the sheet labels', () => {
    const undropped = changes.filter((c) => c.to === 'classify' && c.from !== 'outbound');
    expect(undropped.map((c) => c.id).sort()).toEqual(['107', '128', '132', '133', '140']);
    expect(undropped.filter((c) => c.from === 'mailing_list').map((c) => c.id)).toEqual(['107', '128']);
    expect(undropped.filter((c) => c.from === 'automated_sender').map((c) => c.id)).toEqual(['132', '133', '140']);
  });

  it('reaches the model on 80 of the 90 — 63 before, +21 same-domain, −9 spam, +5 undropped', () => {
    const count = (table: typeof EXPECTED) =>
      Object.values(table).reduce(
        (n, rows) => n + Object.values(rows).filter((v) => v === 'classify').length,
        0,
      );
    expect(count(POLICY_1_0)).toBe(63);
    expect(count(EXPECTED)).toBe(80);
  });

  // The measurement that motivated F0b. `internal` is the class the KAI-93
  // report shows the models recognising ~90% of the time, and the old policy
  // removed most of it before any model was asked.
  it('takes `internal` from 2 of 10 reaching the classifier to 10 of 10', () => {
    const internalIds = ['131', '132', '133', '134', '135', '136', '137', '138', '139', '140'];
    const reaching = (table: typeof EXPECTED) =>
      internalIds.filter((id) => table['coverage']![id] === 'classify');

    expect(reaching(POLICY_1_0)).toEqual(['131', '136']);
    // 132, 133 and 140 are the app's own notifier. Policy 2.0.0 left them gated
    // as automated senders; 4.0.0 stopped treating the house's own robot as a
    // stranger's bulk mail, so the whole class now reaches the classifier.
    expect(reaching(EXPECTED)).toEqual(internalIds);
  });

  // What the spam rule buys the derivation table downstream: `spam` and an
  // unsolicited vendor offer are both "commercial, no action needed", so no
  // combination of the two model axes could separate them. Answering spam from
  // the envelope is what makes the table fittable.
  it('leaves the classifier four types to tell apart on external mail, not five', () => {
    const external = Object.entries(EXPECTED['coverage']!)
      .filter(([, v]) => v === 'classify')
      .map(([id]) => id);
    expect(external.some((id) => SPAM_FILTERED.includes(id))).toBe(false);
  });
});
