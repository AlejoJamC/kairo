
import {
  type Actionability,
  type Provenance,
  type SubjectMatter,
  type TicketType,
} from '@kairo/types';

import type { ClassificationResult } from './schema';
import type { MailFacts } from './types';


export const DERIVATION_VERSION = '1.1.0';


export const EXTERNAL_FALLBACK_FACTS = {
  senderIsTenantAddress: false,
  senderIsTenantDomain: false,
} as Parameters<typeof provenanceOf>[0];


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


export const TYPE_DERIVATION: Record<DerivationKey, TicketType> = {
  'external|needs_action|service': 'support',
  'external|needs_action|commercial_demand': 'prospect',
  'external|needs_action|commercial_offer': 'other',
  'external|needs_action|admin': 'internal',
  'external|fyi|service': 'support',
  'external|fyi|commercial_demand': 'prospect',
  'external|fyi|commercial_offer': 'other',
  'external|fyi|admin': 'internal',
  'same_company|needs_action|service': 'support',
  'same_company|needs_action|commercial_demand': 'prospect',
  'same_company|needs_action|commercial_offer': 'other',
  'same_company|needs_action|admin': 'internal',
  'same_company|fyi|service': 'internal',
  'same_company|fyi|commercial_demand': 'prospect',
  'same_company|fyi|commercial_offer': 'other',
  'same_company|fyi|admin': 'internal',
  'tenant_mailbox|needs_action|service': 'support',
  'tenant_mailbox|needs_action|commercial_demand': 'prospect',
  'tenant_mailbox|needs_action|commercial_offer': 'other',
  'tenant_mailbox|needs_action|admin': 'internal',
  'tenant_mailbox|fyi|service': 'internal',
  'tenant_mailbox|fyi|commercial_demand': 'prospect',
  'tenant_mailbox|fyi|commercial_offer': 'other',
  'tenant_mailbox|fyi|admin': 'internal',
};


export interface ModelVerdict {
  actionability: Actionability;
  subjectMatter: SubjectMatter;
}


export function deriveTicketType(facts: MailFacts, verdict: ModelVerdict): TicketType {
  return TYPE_DERIVATION[
    derivationKey(provenanceOf(facts), verdict.actionability, verdict.subjectMatter)
  ];
}


export function reachableTypes(provenance: Provenance): Set<TicketType> {
  const out = new Set<TicketType>();
  for (const [key, type] of Object.entries(TYPE_DERIVATION)) {
    if (key.startsWith(`${provenance}|`)) out.add(type);
  }
  return out;
}


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
