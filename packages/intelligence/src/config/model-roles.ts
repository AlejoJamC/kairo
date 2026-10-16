import { ProviderConfigurationError } from '../providers/base';
import { currentModelRouting } from './model-context';

export const MODEL_ROLES = ['classification', 'reply', 'knowledge_decision', 'knowledge_draft', 'evidence_analysis', 'validation', 'assistant', 'embedding'] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];
export type ModelCapability = 'language' | 'decision' | 'embedding';
export interface ModelRoute {
  role: ModelRole;
  provider: 'gateway' | 'ollama';
  capability: ModelCapability;
  model: string;
}

const ROLE_VARIABLES: Record<ModelRole, string> = {
  classification: 'AI_GATEWAY_CLASSIFICATION_MODEL',
  reply: 'AI_GATEWAY_REPLY_MODEL',
  knowledge_decision: 'AI_GATEWAY_KNOWLEDGE_DECISION_MODEL',
  knowledge_draft: 'AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL',
  evidence_analysis: 'AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL',
  validation: 'AI_GATEWAY_VALIDATION_MODEL',
  assistant: 'AI_GATEWAY_ASSISTANT_MODEL',
  embedding: 'AI_GATEWAY_EMBEDDING_MODEL',
};

export function usesDecisionClassification(env?: Record<string, string | undefined>): boolean {
  if (env === undefined) {
    const scoped = currentModelRouting()?.routes.classification;
    if (scoped) return scoped.capability === 'decision';
  }
  env ??= process.env;
  const mode = env['CLASSIFICATION_MODE'];
  if (mode && !['language', 'decision'].includes(mode)) throw new ProviderConfigurationError('Invalid CLASSIFICATION_MODE');
  return mode === 'decision' || (!mode && env['INTELLIGENCE_PROVIDER'] === 'jev');
}

export function resolveModelRoute(role: ModelRole, env?: Record<string, string | undefined>): ModelRoute {
  if (env === undefined) {
    const scoped = currentModelRouting()?.routes[role];
    if (scoped) return scoped;
  }
  env ??= process.env;
  const capability: ModelCapability = role === 'embedding' ? 'embedding'
    : role === 'knowledge_decision' || role === 'validation' || (role === 'classification' && usesDecisionClassification(env)) ? 'decision' : 'language';
  const explicit = env[ROLE_VARIABLES[role]];
  const configuredProvider = role === 'embedding' ? env['EMBEDDING_PROVIDER']
    : role === 'classification' ? env['INTELLIGENCE_PROVIDER']
    : env['TEXT_PROVIDER'] ?? (env['INTELLIGENCE_PROVIDER'] === 'jev' ? 'ollama' : env['INTELLIGENCE_PROVIDER']);
  const allowedProviders = role === 'embedding' ? ['gateway', 'ollama', 'voyage']
    : role === 'classification' ? ['gateway', 'ollama', 'anthropic', 'jev'] : ['gateway', 'ollama', 'anthropic'];
  if (configuredProvider && !allowedProviders.includes(configuredProvider)) {
    throw new ProviderConfigurationError('Unknown configured model provider');
  }
  const provider = explicit || capability === 'decision' || role === 'assistant' || (configuredProvider && configuredProvider !== 'ollama')
    ? 'gateway' : 'ollama';
  let model: string | undefined;
  if (provider === 'ollama') {
    model = capability === 'embedding' ? env['OLLAMA_EMBEDDING_MODEL'] ?? 'nomic-embed-text-v2-moe'
      : env['OLLAMA_MODEL'] ?? 'granite4.1:3b';
  } else if (capability === 'decision') {
    model = explicit ?? env['AI_GATEWAY_DECISION_MODEL'] ?? env['JEV_MODEL'] ?? 'typesafe-ai/jev';
    if (model === 'jev-latest') model = 'typesafe-ai/jev';
  } else if (capability === 'embedding') {
    model = explicit;
  } else {
    model = explicit ?? (role === 'classification' ? undefined : env['AI_GATEWAY_TEXT_MODEL']) ?? env['AI_GATEWAY_MODEL'];
    if (!model && configuredProvider === 'anthropic') {
      const legacy = env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-20250514';
      model = legacy.includes('/') ? legacy : `anthropic/${legacy}`;
    }
  }
  if (!model) throw new ProviderConfigurationError(`A model must be configured for the ${role} role`);
  if (provider === 'gateway' && !/^[a-z0-9-]+\/[a-z0-9._:-]+$/i.test(model)) {
    throw new ProviderConfigurationError(`The ${role} role requires a Gateway provider/model identifier`);
  }
  return { role, provider, capability, model };
}
