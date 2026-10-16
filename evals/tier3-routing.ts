import { resolveModelRoute, type ModelRole, type ModelRoute } from '../packages/intelligence/src/config/model-roles';
import { resolveEnsembleTarget } from '../packages/intelligence/src/config/ensemble';
import { ProviderConfigurationError } from '../packages/intelligence/src/providers/base';
import type { ModelRoutingContext } from '../packages/intelligence/src/config/model-context';

const roles = ['classification', 'evidence_analysis', 'knowledge_decision', 'knowledge_draft', 'validation'] as const;
type HistoricalRole = typeof roles[number];
const variables: Record<HistoricalRole, string> = {
  classification: 'AI_GATEWAY_CLASSIFICATION_MODEL', evidence_analysis: 'AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL',
  knowledge_decision: 'AI_GATEWAY_KNOWLEDGE_DECISION_MODEL', knowledge_draft: 'AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL', validation: 'AI_GATEWAY_VALIDATION_MODEL',
};
export const tier3ModelTasks = [
  { role: 'classification', input: 'historical message and available account context', task: 'interpret intent, category, tone, priority and urgency for ingestion', condition: 'message passed deterministic routing' },
  { role: 'evidence_analysis', input: 'saved conversation, directory, configuration and approved sources', task: 'reconstruct facts, attempts, confirmed outcomes, contradictions and missing evidence', condition: 'message is persisted and linked to a ticket' },
  { role: 'knowledge_decision', input: 'grounded analysis plus context for historical judgments; available conversation for candidate selection', task: 'make bounded historical judgments and decide whether reusable knowledge merits a draft', condition: 'evidence analysis succeeded; candidate rejection skips drafting' },
  { role: 'knowledge_draft', input: 'candidate conversation, business context and approved references', task: 'write scoped proposals with source quotations', condition: 'candidate selected; unsupported resolutions and policies must not be invented' },
  { role: 'validation', input: 'proposal, source conversation and approved references', task: 'judge novelty, support and policy conflicts for human review', condition: 'draft contains exact source quotations; invalid quotations block the call' },
] as const;

/** Historical evaluation policy; message interpretation does not inherit the initial-scan classifier mode. */
export function tier3Routing(env: Record<string, string | undefined> = process.env) {
  const mode = env['EVAL_TIER3_CLASSIFICATION_MODE'] ?? 'language';
  if (!['language', 'decision'].includes(mode)) throw new ProviderConfigurationError('Invalid EVAL_TIER3_CLASSIFICATION_MODE');
  const resolved = {} as Record<HistoricalRole, ModelRoute>;
  for (const role of roles.filter(role => role !== 'classification')) {
    const override = env[`EVAL_TIER3_${role.toUpperCase()}_MODEL`];
    resolved[role] = resolveModelRoute(role, override ? { ...env, [variables[role]]: override } : env);
  }
  const explicit = env['EVAL_TIER3_CLASSIFICATION_MODEL'];
  if (explicit) {
    resolved.classification = resolveModelRoute('classification', { ...env, CLASSIFICATION_MODE: mode,
      AI_GATEWAY_CLASSIFICATION_MODEL: explicit });
  } else {
    const source = mode === 'language' ? resolved.evidence_analysis : resolved.knowledge_decision;
    resolved.classification = { ...source, role: 'classification' };
  }
  const rawEnsemble = env['EVAL_TIER3_ENSEMBLE'];
  const ensemble = mode === 'language' && rawEnsemble ? resolveEnsembleTarget({ INTELLIGENCE_ENSEMBLE: rawEnsemble }) : null;
  if (rawEnsemble && (!ensemble || mode !== 'language')) throw new ProviderConfigurationError('Invalid Tier 3 ensemble configuration');
  const routes = roles.map(role => resolved[role]);
  const context: ModelRoutingContext = { routes: resolved as Partial<Record<ModelRole, ModelRoute>>, ensemble };
  return { context, routes, ensemble, classificationMode: mode, classificationCallsPerEmail: ensemble ? 2 : 1,
    tasks: tier3ModelTasks,
    scope: 'Tier 3 evaluation only; initial-scan routing and process configuration are unchanged' };
}
