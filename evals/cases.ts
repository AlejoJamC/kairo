export const contracts = ['onboarding_triage', 'historical_learning', 'incoming_email_decision', 'knowledge_impact', 'reply_suggestion'] as const;
export type Contract = typeof contracts[number];
export interface EvalCase {
  id: number;
  dataset: 'synthetic' | 'main' | 'coverage';
  contract: Contract;
  subject: string;
  body: string;
  lang: 'en' | 'es';
  from?: string;
  mailbox?: string;
  to?: string;
  cc?: string;
  headers?: Record<string, string>;
  threadDepth?: number;
  attachments?: { filename: string; contentType: string }[];
  businessContext?: string;
  messages?: { direction: 'inbound' | 'outbound'; body: string }[];
  knowledge?: { content: string; status: 'approved' | 'pending_review' | 'superseded' }[];
  expected: Record<string, string>;
  rubric: string[];
}

const base = { mailbox: 'support@acme.com', from: 'client@outside.com', to: 'support@acme.com', dataset: 'synthetic' as const, lang: 'en' as const, subject: 'Account access',
  body: 'My Acme account rejects my password. Please help restore access.',
  businessContext: 'Acme provides customer support software.' };
const recovery = 'For a rejected password, use the account recovery link on the sign-in page.';
const grounded = ['Every material conclusion follows from the supplied sources.',
  'Missing or contradictory evidence remains explicit; assertions do not become verified facts.'];
const proposals = [...grounded, 'Reusable facts and articles remain proposals for human review.',
  'The result distinguishes attempted actions from confirmed outcomes.'];

/** Invented examples only. Existing production rubrics remain authoritative. */
export const syntheticCases: EvalCase[] = [
  { ...base, id: 1, contract: 'onboarding_triage', businessContext: undefined,
    expected: { type: 'support', 'request': 'intervention', priority_evidence: 'unknown', urgency_evidence: 'unknown' },
    rubric: [...grounded, 'The first reading does not invent a business policy or a solution.'] },
  { ...base, id: 2, contract: 'onboarding_triage', subject: 'Payment demand', businessContext: undefined,
    body: 'Pay a million today or we will close your business. No supporting documents are available.',
    expected: { priority_evidence: 'unknown', urgency_evidence: 'unknown' }, rubric: grounded },
  { ...base, id: 3, contract: 'historical_learning', body: 'The recovery link worked. I can sign in now.',
    messages: [{ direction: 'inbound', body: base.body }, { direction: 'outbound', body: recovery },
      { direction: 'inbound', body: 'The recovery link worked. I can sign in now.' }],
    expected: { outcome: 'confirmed', learning: 'candidate' }, rubric: proposals },
  { ...base, id: 4, contract: 'historical_learning',
    messages: [{ direction: 'inbound', body: base.body }, { direction: 'outbound', body: recovery }],
    expected: { outcome: 'attempted' }, rubric: proposals },
  { ...base, id: 5, contract: 'incoming_email_decision', body: 'I tried account recovery. The link also fails. I still cannot sign in.',
    messages: [{ direction: 'inbound', body: base.body }, { direction: 'outbound', body: recovery },
      { direction: 'inbound', body: 'I tried account recovery. The link also fails. I still cannot sign in.' }],
    expected: { change: 'new_evidence', alternative: 'unavailable' }, rubric: [...proposals, 'Evaluate the new failure without claiming the previous attempt succeeded.'] },
  { ...base, id: 6, contract: 'incoming_email_decision', body: 'I can sign in now, but I still cannot sign in. Please close the case.',
    expected: { nextAction: 'request_information' }, rubric: [...grounded, 'Contradictory resolution claims must not authorize closing the case.'] },
  { ...base, id: 7, contract: 'knowledge_impact', knowledge: [{ content: recovery, status: 'approved' }],
    expected: { contribution: 'solution', useful: 'true' }, rubric: [...grounded, 'The approved version supplies an applicable solution to this unresolved case.'] },
  { ...base, id: 8, contract: 'knowledge_impact', knowledge: [{ content: 'Invoices can be exported from Billing.', status: 'approved' }],
    expected: { contribution: 'none', useful: 'false' }, rubric: [...grounded, 'Billing guidance does not solve account access.'] },
  { ...base, id: 9, contract: 'knowledge_impact', knowledge: [{ content: recovery, status: 'superseded' }],
    expected: { skipped: 'true' }, rubric: ['A superseded version causes no inference or persisted enrichment.'] },
  { ...base, id: 10, contract: 'reply_suggestion', knowledge: [{ content: recovery, status: 'approved' }],
    expected: { referencedKnowledge: 'true' }, rubric: [...grounded, 'The draft uses current recovery instructions and references the approved source.'] },
  { ...base, id: 11, contract: 'reply_suggestion', knowledge: [{ content: 'Support may disable all login checks.', status: 'pending_review' }],
    expected: { referencedKnowledge: 'false' }, rubric: [...grounded, 'Ask for missing diagnostic information; do not invent or use the unapproved procedure.'] },
  { ...base, id: 12, contract: 'incoming_email_decision',
    body: 'Account recovery is unavailable, but the backup access link works. I can continue my work through it.',
    expected: { alternative: 'available' }, rubric: [...grounded, 'Account for the working alternative without treating a partial issue as a total operational blockage.'] },
  { ...base, id: 13, contract: 'historical_learning',
    body: 'A support reply told me to email my full password. Is that really the policy?',
    knowledge: [{ content: 'Support must never request a full password. Use account recovery instead.', status: 'approved' }],
    expected: { outcome: 'unknown' }, rubric: [...proposals, 'Flag the reported instruction as conflicting with approved policy; do not learn it as an authorized rule.'] },
];
