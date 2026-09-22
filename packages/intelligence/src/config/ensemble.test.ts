import { describe, it, expect } from 'bun:test';

import { resolveEnsembleTarget } from './ensemble';

describe('resolveEnsembleTarget', () => {
  it('is off when the variable is unset or blank', () => {
    expect(resolveEnsembleTarget({})).toBeNull();
    expect(resolveEnsembleTarget({ INTELLIGENCE_ENSEMBLE: '   ' })).toBeNull();
  });

  // Ollama model names carry their own colon, so only the first one separates
  // the provider from the model.
  it('splits on the first colon only', () => {
    expect(resolveEnsembleTarget({ INTELLIGENCE_ENSEMBLE: 'ollama:qwen3.8:latest' })).toEqual({
      provider: 'ollama',
      model: 'qwen3.8:latest',
    });
    expect(resolveEnsembleTarget({ INTELLIGENCE_ENSEMBLE: 'anthropic:claude-sonnet-4-6' })).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
  });

  // A typo in an optional second opinion must not stop the primary from
  // answering, so a bad value turns the ensemble off instead of throwing.
  it('turns itself off on a value it cannot use', () => {
    for (const raw of ['openai:gpt', 'ollama', 'ollama:', ':model']) {
      expect(resolveEnsembleTarget({ INTELLIGENCE_ENSEMBLE: raw })).toBeNull();
    }
  });
});
