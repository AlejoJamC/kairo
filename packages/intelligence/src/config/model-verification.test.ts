import { describe, expect, it } from 'bun:test';
import { verifyClassificationModel } from './model-verification';

function catalogTransport(models: { id: string; modelType: string }[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    if (!String(input).endsWith('/config')) throw new Error('unexpected inference request');
    return Response.json({ models: models.map(({ id, modelType }) => ({ id, name: 'Synthetic model', modelType,
      specification: { specificationVersion: 'v4', provider: 'gateway', modelId: id } })) });
  }) as typeof fetch;
}

const language = { INTELLIGENCE_PROVIDER: 'gateway', CLASSIFICATION_MODE: 'language', AI_GATEWAY_API_KEY: 'test-key' };

describe('verifyClassificationModel', () => {
  it('accepts a Gateway model listed in the catalog with the required capability', async () => {
    const env = { ...language, AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/classifier-ok' };
    expect(await verifyClassificationModel(env, catalogTransport([{ id: 'acme/classifier-ok', modelType: 'language' }])))
      .toEqual({ status: 'ok' });
  });

  it('rejects an identifier without the provider prefix', async () => {
    const env = { ...language, AI_GATEWAY_CLASSIFICATION_MODEL: 'Classifier-Without-Provider' };
    const result = await verifyClassificationModel(env, catalogTransport([]));
    expect(result.status).toBe('invalid');
  });

  it('rejects a model whose identifier differs from the catalog only in case', async () => {
    const env = { ...language, AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/Classifier-Case' };
    const result = await verifyClassificationModel(env, catalogTransport([{ id: 'acme/classifier-case', modelType: 'language' }]));
    expect(result).toEqual({ status: 'invalid', reason: 'Configured model is unavailable for the requested Gateway capability' });
  });

  it('rejects a model listed with the wrong capability for the classification mode', async () => {
    const env = { ...language, CLASSIFICATION_MODE: 'decision', AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/language-only' };
    const result = await verifyClassificationModel(env, catalogTransport([{ id: 'acme/language-only', modelType: 'language' }]));
    expect(result.status).toBe('invalid');
  });

  it('rejects a Gateway route without an API key', async () => {
    const env = { INTELLIGENCE_PROVIDER: 'gateway', CLASSIFICATION_MODE: 'language', AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/classifier-nokey' };
    const result = await verifyClassificationModel(env, catalogTransport([]));
    expect(result.status).toBe('invalid');
  });

  it('reports an unreachable catalog as unverified, not invalid', async () => {
    const env = { ...language, AI_GATEWAY_CLASSIFICATION_MODEL: 'acme/classifier-offline' };
    const offline = (async () => { throw new TypeError('network down'); }) as unknown as typeof fetch;
    const result = await verifyClassificationModel(env, offline);
    expect(result.status).toBe('unverified');
  });

  it('skips the catalog for a local Ollama route', async () => {
    const env = { INTELLIGENCE_PROVIDER: 'ollama', CLASSIFICATION_MODE: 'language' };
    expect(await verifyClassificationModel(env, catalogTransport([]))).toEqual({ status: 'ok' });
  });
});
