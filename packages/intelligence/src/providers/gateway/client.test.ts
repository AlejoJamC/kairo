import { describe, expect, it, mock } from 'bun:test';
import { gatewayFetch, gatewayProvenance, gatewayProviderOptions } from './client';
import { GatewayCompletionProvider } from './completion';
import { GatewayEmbeddingProvider } from './embedding';
import { GatewayDecisionProvider } from './decision';

it('blocks every remote inference before network access when BYOK-only enforcement is unavailable', async () => {
  const original = globalThis.fetch;
  const network = mock(async () => Response.json({}));
  globalThis.fetch = network as unknown as typeof fetch;
  try {
    await expect(new GatewayCompletionProvider('synthetic-key', 'moonshotai/kimi-k2.5').complete('Synthetic input')).rejects.toThrow(/BYOK-only/);
    await expect(new GatewayEmbeddingProvider('synthetic-key', 'voyage/acme-model').embed('Synthetic input')).rejects.toThrow(/BYOK-only/);
    await expect(new GatewayDecisionProvider('synthetic-key').decide({ state: 'Synthetic input', questions: {} })).rejects.toThrow(/BYOK-only/);
    await expect(gatewayFetch('https://ai-gateway.vercel.sh/v4/ai/language-model', { method: 'POST', body: '{}' })).rejects.toThrow(/BYOK-only/);
    expect(network).not.toHaveBeenCalled();
  } finally { globalThis.fetch = original; }
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
