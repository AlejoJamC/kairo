import type { RetrievalJudgment } from './retrieval-metrics';

/** Invented controls authored before retrieval; rankings never write judgments. */
export const retrievalDocuments = [
  { key: 'reset', title: 'Recover a forgotten password', body: 'Select Forgot password on the sign-in page. Open the recovery email and choose a new password. Previously used passwords cannot be reused.' },
  { key: 'expired', title: 'Expired password recovery link', body: 'A password reset link expires after thirty minutes. Request a new recovery email and open only the most recent link to set a new password.' },
  { key: 'invoice', title: 'Download an invoice', body: 'Billing administrators can download a PDF invoice from Billing, Invoices, Download. An invoice is available after payment is settled.' },
  { key: 'receipt', title: 'Obtain a payment receipt', body: 'Find the payment in Billing history and select Download receipt. The receipt confirms the amount paid and transaction date; it does not change an invoice.' },
  { key: 'cancel', title: 'Cancel a subscription renewal', body: 'Open Billing, Subscription and select Cancel renewal. Access continues until the paid term ends. No future renewal charge is made.' },
  { key: 'refund', title: 'Request a refund after renewal', body: 'Contact billing support with the invoice number within seven days after renewal to request a refund review. Cancellation alone does not refund an existing charge.' },
  { key: 'invite', title: 'Invite a teammate', body: 'An administrator opens Team and sends an invitation to the new member. The recipient accepts the invitation to join the workspace.' },
  { key: 'export', title: 'Export workspace records', body: 'An administrator can export workspace records as CSV from Settings, Data export. A download link appears when the export is complete.' },
  { key: 'notification', title: 'Disable desktop notifications', body: 'Open Preferences and turn off desktop notifications. This does not change notification permissions in the operating system.' },
  { key: 'language', title: 'Change display language', body: 'Choose English or Spanish in Preferences, Language. This changes interface labels and does not translate stored messages.' },
] as const;

const questions = [
  { id: 'reset-paraphrase', cluster: 'access', query: 'I cannot remember my sign-in secret. How do I regain access?', relevant: { reset: 2, expired: 1 } },
  { id: 'expired-hard', cluster: 'access', query: 'The recovery email arrived, but its link is no longer valid. What should I do?', relevant: { reset: 1, expired: 2 } },
  { id: 'invoice-paraphrase', cluster: 'documents', query: 'Our accountant needs a PDF of the settled bill. Where is the document?', relevant: { invoice: 2, receipt: 1 } },
  { id: 'receipt-hard', cluster: 'documents', query: 'Where can I obtain confirmation of the amount and date of a payment?', relevant: { invoice: 1, receipt: 2 } },
  { id: 'cancel-paraphrase', cluster: 'subscription', query: 'I want to stop being charged next month but keep access until the end of this term.', relevant: { cancel: 2 } },
  { id: 'refund-hard', cluster: 'subscription', query: 'I was already charged for renewal three days ago. Can I ask for the money back?', relevant: { cancel: 1, refund: 2 } },
  { id: 'no-answer-technical', cluster: 'no-answer-technical', query: 'What SAML certificate rotation process and identity provider metadata endpoint are supported?', relevant: {} },
  { id: 'no-answer-policy', cluster: 'no-answer-policy', query: 'Which countries have a legally binding data residency guarantee?', relevant: {} },
];

export function retrievalCases() {
  return questions.map(question => ({ query: question.query, judgment: {
    id: question.id, cluster: question.cluster, eligible: retrievalDocuments.map(row => row.key),
    grades: Object.fromEntries(retrievalDocuments.map(row => [row.key, (question.relevant as Record<string, number>)[row.key] ?? 0])),
  } satisfies RetrievalJudgment }));
}
