import { afterEach, expect, test } from 'bun:test';
import { observeGatewayCredentials } from './gateway-validation.test-helper';

const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

for (const credentialType of ['byok', 'system', null] as const) {
  test(`Gateway validation requires BYOK on every request: ${credentialType ?? 'unknown'}`, async () => {
    let networkCalls = 0;
    globalThis.fetch = Object.assign(async () => {
      networkCalls++;
      return Response.json({ providerMetadata: { gateway: { routing: { canonicalSlug: 'acme/model',
        modelAttempts: [{ providerAttempts: [{ provider: 'acme', success: true,
          ...(credentialType ? { credentialType } : {}) }] }] } } } });
    }, original) as typeof fetch;
    const observer = observeGatewayCredentials();
    const request = () => fetch('https://ai-gateway.vercel.sh/v4/ai/language-model', { method: 'POST' });
    try {
      if (credentialType === 'byok') {
        await request(); await request(); observer.assertVerified();
        expect(networkCalls).toBe(2);
        expect(observer.requests).toHaveLength(2);
      } else {
        await expect(request()).rejects.toThrow('BYOK was not verified');
        await expect(request()).rejects.toThrow('BYOK was not verified');
        expect(networkCalls).toBe(1);
        expect(() => observer.assertVerified()).toThrow('BYOK was not verified');
      }
    } finally { observer.restore(); }
  });
}
