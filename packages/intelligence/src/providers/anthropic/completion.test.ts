import { describe, expect, it } from 'bun:test';
import { AnthropicCompletionProvider } from './completion';
import { GatewayCompletionProvider } from '../gateway/completion';

describe('Anthropic compatibility configuration', () => {
  it('resolves through the common Gateway provider', () => {
    const provider = new AnthropicCompletionProvider('test-key', 'claude-test-model');
    expect(provider).toBeInstanceOf(GatewayCompletionProvider);
    expect(provider.model).toBe('anthropic/claude-test-model');
  });
});
