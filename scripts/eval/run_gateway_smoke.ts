import { classifyEmailWithMeta, resolveModelRoute, usesDecisionClassification, ProviderError,
  type EmailMessage, type ModelVerdictResult } from '../../packages/intelligence/src/index';
import { summarizeSmoke, type SmokeMeasurement } from './lib/gateway-smoke-metrics';
import { observeGatewayCredentials } from '../../apps/api/src/lib/gateway-validation.test-helper';
import { buildEmailClassifierInput } from '../../apps/api/src/lib/classifier-input';
import { extractMailFacts } from '../../apps/api/src/lib/email/mail-facts';

// Invented compatibility examples. No corpus files or product database access.
const examples = [
  { subject: 'Cannot sign in', body: 'My Acme account rejects my password. Please help restore access.',
    expected: { type: 'support', actionability: 'needs_action', subject_matter: 'service', category: 'account', priority: 'P2', tone: 'neutral', urgency: 'medium' } },
  { subject: 'Request for a quote', body: 'We want to buy Acme support software. Please send a quote.',
    expected: { type: 'prospect', actionability: 'needs_action', subject_matter: 'commercial_demand', category: 'general', priority: 'P3', tone: 'neutral', urgency: 'low' } },
  { subject: 'Payment received', body: 'This confirms payment for the Acme subscription. No action or reply is needed.',
    expected: { type: 'support', actionability: 'fyi', subject_matter: 'service', category: 'billing', priority: 'P3', tone: 'neutral', urgency: 'low' } },
  { subject: 'Service stopped', body: 'Acme is unavailable. Our entire team is blocked right now. Restore service immediately.',
    consequential: true, expected: { type: 'support', actionability: 'needs_action', subject_matter: 'service',
      category: 'technical', priority: 'P1', tone: 'neutral', urgency: 'high' } },
  { subject: 'Cannot sign in', body: 'My Acme account rejects my password. Please help restore access.',
    incompleteEvidence: true, expected: { type: 'support', actionability: 'needs_action', subject_matter: 'service',
      category: 'account', priority: 'P2', tone: 'neutral', urgency: 'medium' } },
] as const;

const stages = ['onboarding', 'backfill', 'new_email'] as const;
const route = resolveModelRoute('classification');
if (route.provider !== 'gateway') throw new ProviderError('Configure a Gateway classifier for the remote stage evaluation', false);
const measurements: SmokeMeasurement[] = [];
const credentials = observeGatewayCredentials();

function messageFor(stage: typeof stages[number], example: typeof examples[number]): EmailMessage {
  const facts = extractMailFacts({ from: 'client@outside.com', subject: example.subject,
    headers: { To: 'support@acme.com' }, tenantMailbox: ['support@acme.com'] });
  return buildEmailClassifierInput({ stage, subject: example.subject, from: 'client@outside.com',
    bodyPlain: 'incompleteEvidence' in example ? null : example.body, snippet: example.body, facts,
    context: { tenantMailbox: 'support@acme.com', tenantMailboxes: ['support@acme.com'],
      businessContext: stage === 'onboarding' ? undefined : 'Acme provides customer support software.' } });
}

function record(stage: typeof stages[number], capability: string, model: string, started: number,
  costUsd: number | null, verdict: ModelVerdictResult, type: string, abstain: boolean, example: typeof examples[number]) {
  const { reasoning: _reasoning, confidence: _confidence, decision: _decision, workflow: _workflow, ...prediction } = verdict;
  measurements.push({ stage, capability, model, latencyMs: Math.round(performance.now() - started), costUsd,
    truth: { ...example.expected }, prediction: { ...prediction, type }, abstain,
    consequential: 'consequential' in example, incompleteEvidence: 'incompleteEvidence' in example });
}


try {
  for (const stage of stages) {
    for (const example of examples) {
      const message = messageFor(stage, example);
      const started = performance.now();
      const output = await classifyEmailWithMeta(message, { lang: 'en' });
      record(stage, usesDecisionClassification() ? 'decision' : 'language', output.meta.model, started,
        output.meta.costUsd ?? null, output.verdict, output.result.type, output.abstain, example);
    }
    console.log(JSON.stringify({ stage, completed: measurements.filter((item) => item.stage === stage).length }));
  }
  credentials.assertVerified();
  console.log(JSON.stringify({ purpose: 'synthetic_stage_evaluation', cells: summarizeSmoke(measurements),
    requests: credentials.requests, productionCalibration: 'not_measured', automaticActions: 'not_authorized' }, null, 2));
} catch (error) {
  console.error(error instanceof ProviderError ? error.message : 'Gateway smoke check failed');
  console.error(JSON.stringify({ completed: measurements.length, transport: credentials.diagnostic,
    verifiedRequests: credentials.requests }));
  process.exitCode = 1;
} finally {
  credentials.restore();

}
