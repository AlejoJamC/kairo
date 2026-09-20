// ---------------------------------------------------------------------------
// KAI-45 F2 — `ticket_type` as a table, not as a sixth thing the model guesses.
//
// The five types are the product of two independent questions, so a model asked
// to pick one of five has to collapse them itself, silently and differently
// every time. Email 101 is a forward between two of the company's own mailboxes
// AND an invitation to bid; 12 of the 15 label-vs-rubric disagreements in the
// KAI-93 coverage corpus are exactly that shape. Five rounds of rubric edits
// could not settle them because each new rule picks one axis and breaks the
// other.
//
// So the model answers the two questions it is actually good at — does the
// sender want something, and what is this about — and the third dimension,
// where the message came from, is read off the envelope where it has always
// been. This module multiplies them back out.
//
// **Direction of fit.** The sheet in scripts/eval/data/input is the
// specification: KAI-100/KAI-101 produced it, KAI-102 adjudicated it, the
// product owner confirmed it. This table is fitted to reproduce those labels.
// A combination that cannot reach the label its emails carry means an axis is
// missing or badly defined — never that a label is wrong.
//
// Shape follows escalation/detect.ts: tables as module constants, one pure
// function over them, no I/O.
// ---------------------------------------------------------------------------

import {
  type Actionability,
  type Provenance,
  type SubjectMatter,
  type TicketType,
} from '@kairo/types';

import type { ClassificationResult } from './schema';
import type { MailFacts } from './types';

/**
 * Bumped whenever a cell changes. Persisted with the classification so a stored
 * `ticket_type` can be read back against the table that produced it — without
 * it, a row from last week and a corpus run from today disagreeing is
 * indistinguishable from a model that changed its mind.
 */
export const DERIVATION_VERSION = '1.0.0';

/**
 * Where the message came from, from the envelope. Three reachable states.
 *
 * Not a label and not a decision: on the coverage corpus the eleven messages
 * between the company's own mailboxes carry three different types in the sheet,
 * so provenance alone never settles a class. It is one of the three coordinates.
 */
export function provenanceOf(facts: MailFacts): Provenance {
  if (facts.senderIsTenantAddress) return 'tenant_mailbox';
  if (facts.senderIsTenantDomain) return 'same_company';
  return 'external';
}

export type DerivationKey = `${Provenance}|${Actionability}|${SubjectMatter}`;

export function derivationKey(
  provenance: Provenance,
  actionability: Actionability,
  subjectMatter: SubjectMatter,
): DerivationKey {
  return `${provenance}|${actionability}|${subjectMatter}`;
}

/**
 * The 18 cells. Every combination has an entry — a missing one would surface as
 * `undefined` reaching the database, and the completeness test exists to stop
 * that before it ships.
 *
 * Note `spam` appears nowhere. It is answered before this runs, by
 * `X-Spam-Status` in the routing policy: an unsolicited vendor offer and a
 * phishing attempt are both "commercial, no action needed", so no pair of axes
 * can separate them. The envelope can, so the envelope does — which is also
 * what leaves this table four types to produce instead of five.
 */
export const TYPE_DERIVATION: Record<DerivationKey, TicketType> = {
  // ── Mail from outside the company ─────────────────────────────────────────
  // The common case: 40 of the 90 corpus emails are an external sender asking
  // for something about the service.
  'external|needs_action|service': 'support',
  // Someone who is not a customer yet and wants to be.
  'external|needs_action|commercial': 'prospect',
  // An outsider asking the house to do its own paperwork — a CV, a summons, a
  // compliance form. The rubric has said this since es.md:44: a message can
  // arrive from outside and still be the company's own housekeeping.
  'external|needs_action|admin': 'internal',
  // A customer telling us something about their service without asking: still
  // the queue's business.
  'external|fyi|service': 'support',
  // Vendor offers, ad pitches, event invitations. The single largest `other`
  // group in the corpus (121, 124, 126, 128, 129, 130).
  'external|fyi|commercial': 'other',
  'external|fyi|admin': 'internal',

  // ── Another mailbox of the same company ───────────────────────────────────
  // Arrived in the inbox, was not sent from it. Until routing policy 1.1.0 this
  // whole group was dropped as "outbound" and never reached a classifier.
  'same_company|needs_action|service': 'support',
  // A bid invitation forwarded to the commercial area (101, 106).
  'same_company|needs_action|commercial': 'prospect',
  // Coordination between areas (125: customer service to the dispatcher).
  'same_company|needs_action|admin': 'internal',
  // The one cell where provenance changes the answer. An outsider stating
  // something about the service is the queue's business; the house stating
  // something about its own operation to its own people is housekeeping.
  'same_company|fyi|service': 'internal',
  'same_company|fyi|commercial': 'other',
  'same_company|fyi|admin': 'internal',

  // ── The monitored mailbox itself ──────────────────────────────────────────
  // A copy of the house's own message, pulled into the inbox by the POP fetch.
  'tenant_mailbox|needs_action|service': 'support',
  'tenant_mailbox|needs_action|commercial': 'prospect',
  'tenant_mailbox|needs_action|admin': 'internal',
  // 137: the holiday-schedule announcement to 16 clients. About the service,
  // asking nothing, sent by the house — `internal` in the sheet, and the reason
  // this cell cannot simply mirror the external row.
  'tenant_mailbox|fyi|service': 'internal',
  'tenant_mailbox|fyi|commercial': 'other',
  'tenant_mailbox|fyi|admin': 'internal',
};

/** What the model answers, before the type is derived from it. */
export interface ModelVerdict {
  actionability: Actionability;
  subjectMatter: SubjectMatter;
}

/**
 * The `ticket_type` for one message.
 *
 * Total by construction: every key has an entry and the completeness test holds
 * that, so there is no fallback to hide a gap behind.
 */
export function deriveTicketType(facts: MailFacts, verdict: ModelVerdict): TicketType {
  return TYPE_DERIVATION[
    derivationKey(provenanceOf(facts), verdict.actionability, verdict.subjectMatter)
  ];
}

/**
 * Every type a given provenance can produce.
 *
 * This is what the fit is checked against: the sheet assigns real types to real
 * messages, and a row that cannot reach one of them could never reproduce it,
 * whatever the model answers. Checking it costs no model call.
 */
export function reachableTypes(provenance: Provenance): Set<TicketType> {
  const out = new Set<TicketType>();
  for (const [key, type] of Object.entries(TYPE_DERIVATION)) {
    if (key.startsWith(`${provenance}|`)) out.add(type);
  }
  return out;
}

/**
 * The classification a caller stores, from the envelope and the model's answer.
 *
 * Deliberately still a `ClassificationResult`: the derivation is contained
 * inside this package, so the seven call sites, the priority score, the
 * dashboard and the database are untouched and F2 needs no migration.
 */
export function deriveClassification(
  facts: MailFacts,
  verdict: ModelVerdict & Pick<ClassificationResult, 'priority' | 'tone' | 'urgency' | 'reasoning'>,
  category: ClassificationResult['category'],
  confidence: number,
): ClassificationResult {
  return {
    type: deriveTicketType(facts, verdict),
    priority: verdict.priority,
    category,
    tone: verdict.tone,
    urgency: verdict.urgency,
    reasoning: verdict.reasoning,
    confidence,
  };
}
