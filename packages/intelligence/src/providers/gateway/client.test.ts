import { describe, expect, it, mock } from 'bun:test';
import { ProviderConfigurationError } from '../base';
import { gatewayFetch, gatewayKey, gatewayProvenance, gatewayProviderOptions, warnIfSystemCredential } from './client';

it('sends inference through the shared transport and never follows a redirect', async () => {
  const original = globalThis.fetch;
  const network = mock(async (_input: unknown, _init?: RequestInit) => Response.json({}));
  globalThis.fetch = network as unknown as typeof fetch;
  try {
    await gatewayFetch('https://ai-gateway.vercel.sh/v4/ai/language-model', { method: 'POST', body: '{}' });
    expect(network).toHaveBeenCalledTimes(1);
    const init = network.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeDefined();
  } finally { globalThis.fetch = original; }
});

describe('Gateway configuration failures', () => {
  it('reports a missing key as a retriable configuration fault, not a permanent one', () => {
    let failure: unknown;
    try { gatewayKey({}); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ProviderConfigurationError);
    expect((failure as ProviderConfigurationError).retriable).toBe(true);
  });

  it('warns only when a request was served with system credentials', () => {
    const warn = mock(() => {});
    const original = console.warn;
    console.warn = warn as unknown as typeof console.warn;
    try {
      warnIfSystemCredential({ credentialType: 'byok', model: 'moonshotai/kimi-k2.6' });
      warnIfSystemCredential({ credentialType: null, model: 'moonshotai/kimi-k2.6' });
      expect(warn).not.toHaveBeenCalled();
      warnIfSystemCredential({ credentialType: 'system', model: 'moonshotai/kimi-k2.6' });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally { console.warn = original; }
  });
});

describe('Gateway serving provider restrictions', () => {
  it('restricts Kimi to Moonshot instead of allowing Bedrock or another serving provider', () => {
    expect(gatewayProviderOptions('moonshotai/kimi-k2.5', {})).toEqual({ gateway: { only: ['moonshotai'] } });
    expect(gatewayProviderOptions('typesafe-ai/jev', {})).toEqual({ gateway: { only: ['typesafe-ai'] } });
  });

  it('supports explicit routes without assuming the model owner serves every model', () => {
    const env = { AI_GATEWAY_PROVIDER_ROUTES: JSON.stringify({ openai: ['azure'], 'openai/acme-model': ['openai'] }) };
    expect(gatewayProviderOptions('openai/acme-model', env).gateway.only).toEqual(['openai']);
    expect(gatewayProviderOptions('openai/acme-other-model', env).gateway.only).toEqual(['azure']);
    expect(() => gatewayProviderOptions('openai/acme-model', { AI_GATEWAY_PROVIDER_ROUTES: '{' })).toThrow(/Invalid/);
    expect(() => gatewayProviderOptions('openai/acme-model', { AI_GATEWAY_PROVIDER_ROUTES: '{"openai":[]}' })).toThrow(/Invalid/);
  });

  it('reports BYOK and system credentials separately without copying provider errors or secrets', () => {
    const metadata = { gateway: { cost: '0.001', routing: { canonicalSlug: 'moonshotai/kimi-k2.5',
      modelAttempts: [{ providerAttempts: [
        { provider: 'moonshotai', credentialType: 'byok', success: false, error: 'private-marker' },
        { provider: 'moonshotai', credentialType: 'system', success: true, apiKey: 'private-marker' },
      ] }] } } };
    const provenance = gatewayProvenance(metadata, 'requested-model');
    expect(provenance.credentialType).toBe('system');
    expect(provenance.inferenceProvider).toBe('moonshotai');
    expect(JSON.stringify(provenance)).not.toContain('private-marker');
    expect(gatewayProvenance(undefined, 'requested-model').credentialType).toBeNull();
  });
});
