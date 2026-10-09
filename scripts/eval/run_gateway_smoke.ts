import {
  classifyEmailWithDecision, classifyEmailWithMeta, GatewayDecisionProvider,
  resolveModelRoute, ProviderError, type EmailMessage, type ModelVerdictResult,
} from '../../packages/intelligence/src/index';
import { gatewayKey } from '../../packages/intelligence/src/providers/gateway/client';
import { extractMailFacts } from '../../apps/api/src/lib/email/mail-facts';

// Invented compatibility examples. No corpus files or product database access.
const examples = [
  { subject: 'Cannot sign in', body: 'My Acme account rejects my password. Please help restore access.',
    expected: { type: 'support', actionability: 'needs_action', subject_matter: 'service', category: 'account' } },
  { subject: 'Request for a quote', body: 'We want to buy Acme support software. Please send a quote.',
    expected: { type: 'prospect', actionability: 'needs_action', subject_matter: 'commercial_demand', category: 'general' } },
  { subject: 'Payment received', body: 'This confirms payment for the Acme subscription. No action or reply is needed.',
    expected: { type: 'other', actionability: 'fyi', subject_matter: 'service', category: 'billing' } },
] as const;

const stages = ['onboarding', 'backfill', 'new_email'] as const;
const key = gatewayKey();
const languageModel = process.env['AI_GATEWAY_REPLY_MODEL'] ?? process.env['AI_GATEWAY_TEXT_MODEL'] ?? process.env['AI_GATEWAY_MODEL'];
if (!languageModel) throw new ProviderError('Configure AI_GATEWAY_MODEL for the generative smoke check', false);
const nativeModels = new Set(['typesafe-ai/jev', resolveModelRoute('knowledge_decision').model]);
if (process.env['CLASSIFICATION_MODE'] === 'decision') nativeModels.add(resolveModelRoute('classification').model);

interface Measurement {
  stage: string; capability: string; model: string; latencyMs: number; costUsd: number | null;
  typeCorrect: boolean; dimensions: Record<string, boolean>; needsReview: boolean;
}
const measurements: Measurement[] = [];

function messageFor(stage: typeof stages[number], example: typeof examples[number]): EmailMessage {
  const facts = extractMailFacts({ from: 'client@outside.com', subject: example.subject,
    headers: { To: 'support@acme.com' }, tenantMailbox: ['support@acme.com'] });
  return { stage, subject: example.subject, body: example.body, from: 'client@outside.com',
    to: 'support@acme.com', tenantMailbox: 'support@acme.com', facts,
    businessContext: stage === 'onboarding' ? undefined : 'Acme provides customer support software.',
    evidence: { bodySource: 'full', truncated: false, missing: [] } };
}

function dimensions(verdict: ModelVerdictResult, example: typeof examples[number]) {
  return { actionability: verdict.actionability === example.expected.actionability,
    subjectMatter: verdict.subject_matter === example.expected.subject_matter,
    category: verdict.category === example.expected.category };
}

const variables = ['CLASSIFICATION_MODE', 'INTELLIGENCE_PROVIDER', 'AI_GATEWAY_CLASSIFICATION_MODEL', 'INTELLIGENCE_ENSEMBLE'] as const;
const original = new Map(variables.map((name) => [name, process.env[name]]));
try {
  delete process.env['INTELLIGENCE_ENSEMBLE'];
  for (const stage of stages) {
    for (const example of examples) {
      const message = messageFor(stage, example);
      for (const model of nativeModels) {
        const started = performance.now();
        const output = await classifyEmailWithDecision(message, new GatewayDecisionProvider(key, model));
        measurements.push({ stage, capability: 'decision', model: output.decision.modelVersion,
          latencyMs: Math.round(performance.now() - started),
          costUsd: typeof output.decision.rawMetadata?.['costUsd'] === 'number' ? output.decision.rawMetadata['costUsd'] : null,
          typeCorrect: output.result.type === example.expected.type,
          dimensions: dimensions(output.verdict, example), needsReview: true });
      }
      process.env['CLASSIFICATION_MODE'] = 'language';
      process.env['INTELLIGENCE_PROVIDER'] = 'gateway';
      process.env['AI_GATEWAY_CLASSIFICATION_MODEL'] = languageModel;
      const started = performance.now();
      const output = await classifyEmailWithMeta(message, { lang: 'en' });
      measurements.push({ stage, capability: 'language', model: output.meta.model,
        latencyMs: Math.round(performance.now() - started), costUsd: output.meta.costUsd ?? null,
        typeCorrect: output.result.type === example.expected.type,
        dimensions: dimensions(output.verdict, example), needsReview: output.abstain });
    }
  }
  console.log(JSON.stringify({ purpose: 'synthetic_compatibility', measurements,
    productionCalibration: 'not_measured', automaticCoverage: 'not_authorized_by_this_check' }, null, 2));
} catch (error) {
  console.error(error instanceof ProviderError ? error.message : 'Gateway smoke check failed');
  process.exitCode = 1;
} finally {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}
