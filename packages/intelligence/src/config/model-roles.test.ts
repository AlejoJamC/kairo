import { describe, expect, it } from 'bun:test';
import { resolveModelRoute } from './model-roles';

describe('model role routing', () => {
  it('selects independent language and native decision models by role', () => {
    const env = { INTELLIGENCE_PROVIDER: 'gateway', TEXT_PROVIDER: 'gateway', CLASSIFICATION_MODE: 'decision',
      AI_GATEWAY_CLASSIFICATION_MODEL: 'typesafe-ai/jev', AI_GATEWAY_KNOWLEDGE_DECISION_MODEL: 'acme/native-decision',
      AI_GATEWAY_REPLY_MODEL: 'acme/language-a', AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL: 'acme/language-b',
      AI_GATEWAY_ASSISTANT_MODEL: 'acme/language-c', AI_GATEWAY_EMBEDDING_MODEL: 'acme/vector' };
    expect(resolveModelRoute('classification', env).capability).toBe('decision');
    expect(resolveModelRoute('knowledge_decision', env).model).toBe('acme/native-decision');
    expect(resolveModelRoute('reply', env).model).toBe('acme/language-a');
    expect(resolveModelRoute('knowledge_draft', env).model).toBe('acme/language-b');
    expect(resolveModelRoute('assistant', env).model).toBe('acme/language-c');
    expect(resolveModelRoute('embedding', env).capability).toBe('embedding');
  });

  it('changes classification capability without changing generation roles', () => {
    const env = { CLASSIFICATION_MODE: 'language', INTELLIGENCE_PROVIDER: 'gateway', AI_GATEWAY_MODEL: 'acme/language' };
    expect(resolveModelRoute('classification', env)).toEqual({ role: 'classification', provider: 'gateway',
      capability: 'language', model: 'acme/language' });
    expect(resolveModelRoute('knowledge_decision', env).capability).toBe('decision');
  });

  it('rejects missing or invalid remote configuration rather than changing capability', () => {
    expect(() => resolveModelRoute('assistant', {})).toThrow(/must be configured/);
    expect(() => resolveModelRoute('classification', { CLASSIFICATION_MODE: 'unknown' })).toThrow(/CLASSIFICATION_MODE/);
    expect(() => resolveModelRoute('reply', { TEXT_PROVIDER: 'jev' })).toThrow(/Unknown configured/);
    expect(() => resolveModelRoute('embedding', { EMBEDDING_PROVIDER: 'gateway' })).toThrow(/must be configured/);
  });

  it('keeps local inference separate and routes legacy remote aliases through Gateway', () => {
    expect(resolveModelRoute('reply', { TEXT_PROVIDER: 'ollama', OLLAMA_MODEL: 'test-model' }).provider).toBe('ollama');
    expect(resolveModelRoute('classification', { INTELLIGENCE_PROVIDER: 'jev', JEV_MODEL: 'jev-latest' }))
      .toEqual({ role: 'classification', provider: 'gateway', capability: 'decision', model: 'typesafe-ai/jev' });
    expect(resolveModelRoute('reply', { TEXT_PROVIDER: 'anthropic' }).provider).toBe('gateway');
  });
});
