import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { createTextProvider, resolveTextProviderId } from './providers';

const KEYS = ['TEXT_PROVIDER', 'INTELLIGENCE_PROVIDER', 'ANTHROPIC_API_KEY', 'OLLAMA_MODEL'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('resolveTextProviderId', () => {
  it('TEXT_PROVIDER wins over the classifier variable', () => {
    process.env['TEXT_PROVIDER'] = 'anthropic';
    process.env['INTELLIGENCE_PROVIDER'] = 'ollama';
    expect(resolveTextProviderId()).toBe('anthropic');
  });

  it('follows INTELLIGENCE_PROVIDER when TEXT_PROVIDER is unset', () => {
    process.env['INTELLIGENCE_PROVIDER'] = 'anthropic';
    expect(resolveTextProviderId()).toBe('anthropic');
  });

  it('falls back to ollama when the classifier is jev, which cannot generate text', () => {
    process.env['INTELLIGENCE_PROVIDER'] = 'jev';
    expect(resolveTextProviderId()).toBe('ollama');
  });

  it('defaults to ollama when nothing is set', () => {
    expect(resolveTextProviderId()).toBe('ollama');
  });
});

describe('createTextProvider', () => {
  it('builds the ollama provider with its configured model when the classifier is jev', () => {
    process.env['INTELLIGENCE_PROVIDER'] = 'jev';
    process.env['OLLAMA_MODEL'] = 'test-model';
    expect(createTextProvider().model).toBe('test-model');
  });

  it('rejects TEXT_PROVIDER=jev instead of silently using another provider', () => {
    process.env['TEXT_PROVIDER'] = 'jev';
    expect(() => createTextProvider()).toThrow(/no free-text completion/);
  });
});
