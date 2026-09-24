import { describe, it, expect } from 'bun:test';

import {
  COMPLETION_PROVIDER_IDS,
  isCompletionProviderId,
  findCompletionProvider,
} from './completion-registry';
import { OllamaCompletionProvider } from '../providers/ollama/completion';
import { AnthropicCompletionProvider } from '../providers/anthropic/completion';

describe('completion-registry', () => {
  it('lists every known provider id, in registration order', () => {
    expect(COMPLETION_PROVIDER_IDS).toEqual(['ollama', 'anthropic']);
  });

  it('accepts a known id and rejects anything else', () => {
    expect(isCompletionProviderId('ollama')).toBe(true);
    expect(isCompletionProviderId('anthropic')).toBe(true);
    expect(isCompletionProviderId('openai')).toBe(false);
    expect(isCompletionProviderId('')).toBe(false);
  });

  it('resolves ollama with env defaults', () => {
    const provider = findCompletionProvider('ollama').create({});
    expect(provider).toBeInstanceOf(OllamaCompletionProvider);
    expect(provider.model).toBe('llama3.2');
  });

  it('a model override wins over the env variable', () => {
    const provider = findCompletionProvider('ollama').create({ OLLAMA_MODEL: 'from-env' }, 'from-target');
    expect(provider.model).toBe('from-target');
  });

  it('resolves anthropic when a key is present', () => {
    const provider = findCompletionProvider('anthropic').create({ ANTHROPIC_API_KEY: 'test-key' });
    expect(provider).toBeInstanceOf(AnthropicCompletionProvider);
  });

  it('anthropic without a key fails clearly instead of constructing a broken client', () => {
    expect(() => findCompletionProvider('anthropic').create({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('an unknown id fails clearly and names what is known', () => {
    expect(() => findCompletionProvider('bedrock')).toThrow(/Unknown completion provider "bedrock"/);
    expect(() => findCompletionProvider('bedrock')).toThrow(/ollama, anthropic/);
  });
});
