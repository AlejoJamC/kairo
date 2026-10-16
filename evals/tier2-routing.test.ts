import { expect, test } from 'bun:test';
import { tier2Routing } from './tier2-routing';
import { resolveModelRoute, usesDecisionClassification } from '../packages/intelligence/src/config/model-roles';
import { resolveEnsembleTarget } from '../packages/intelligence/src/config/ensemble';
import { withModelRouting } from '../packages/intelligence/src/config/model-context';

const configured = { INTELLIGENCE_PROVIDER: 'gateway', TEXT_PROVIDER: 'gateway', CLASSIFICATION_MODE: 'decision',
  AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/initial-classifier', AI_GATEWAY_MODEL: 'acme/language',
  AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL: 'acme/evidence', AI_GATEWAY_DECISION_MODEL: 'acme/typed',
  INTELLIGENCE_ENSEMBLE: 'gateway:acme/initial-ensemble' };

test('historical interpretation uses its language route rather than initial classification mode or ensemble', () => {
  const historical = tier2Routing(configured);
  expect(historical.routes.find(route => route.role === 'classification')).toEqual({ role: 'classification', provider: 'gateway', capability: 'language', model: 'acme/evidence' });
  expect(historical.routes.find(route => route.role === 'knowledge_decision')).toMatchObject({ capability: 'decision', model: 'acme/typed' });
  expect(historical.routes.find(route => route.role === 'validation')).toMatchObject({ capability: 'decision', model: 'acme/typed' });
  expect(historical.ensemble).toBeNull();
  expect(resolveModelRoute('classification', configured)).toMatchObject({ capability: 'decision', model: 'acme/initial-classifier' });
  expect(configured.INTELLIGENCE_ENSEMBLE).toBe('gateway:acme/initial-ensemble');
});

test('each historical function can select an independent model without changing shared settings', () => {
  const policy = tier2Routing({ ...configured, EVAL_TIER2_CLASSIFICATION_MODE: 'decision', EVAL_TIER2_CLASSIFICATION_MODEL: 'acme/historical-classifier',
    EVAL_TIER2_EVIDENCE_ANALYSIS_MODEL: 'acme/historical-evidence', EVAL_TIER2_KNOWLEDGE_DECISION_MODEL: 'acme/historical-selection',
    EVAL_TIER2_KNOWLEDGE_DRAFT_MODEL: 'acme/historical-draft', EVAL_TIER2_VALIDATION_MODEL: 'acme/historical-validation' });
  expect(policy.routes.map(route => route.model)).toEqual(['acme/historical-classifier', 'acme/historical-evidence', 'acme/historical-selection', 'acme/historical-draft', 'acme/historical-validation']);
  expect(policy.routes[0]!.capability).toBe('decision');
  expect(() => tier2Routing({ ...configured, EVAL_TIER2_CLASSIFICATION_MODE: 'invalid' })).toThrow();
  expect(() => tier2Routing({ ...configured, EVAL_TIER2_ENSEMBLE: 'invalid' })).toThrow();
});

test('concurrent historical and initial-scan scopes keep distinct routes, dispatch and ensembles', async () => {
  const original = { ...process.env };
  const initial = { routes: { classification: resolveModelRoute('classification', configured) }, ensemble: resolveEnsembleTarget(configured) };
  const historical = tier2Routing(configured);
  await Promise.all([
    withModelRouting(initial, async () => {
      await new Promise(done => setTimeout(done, 5));
      expect(resolveModelRoute('classification').model).toBe('acme/initial-classifier');
      expect(usesDecisionClassification()).toBe(true);
      expect(resolveEnsembleTarget()?.model).toBe('acme/initial-ensemble');
    }),
    withModelRouting(historical.context, async () => {
      await new Promise(done => setTimeout(done, 1));
      expect(resolveModelRoute('classification').model).toBe('acme/evidence');
      expect(usesDecisionClassification()).toBe(false);
      expect(resolveEnsembleTarget()).toBeNull();
    }),
  ]);
  expect(JSON.stringify(process.env) === JSON.stringify(original)).toBe(true);
  await expect(withModelRouting(historical.context, async () => { throw new Error('Invented failure'); })).rejects.toThrow('Invented failure');
  expect(JSON.stringify(process.env) === JSON.stringify(original)).toBe(true);
});
