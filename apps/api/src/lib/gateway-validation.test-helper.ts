import { gatewayProvenance } from '@kairo/intelligence';

/** Verify every real inference, including intermediate AI SDK tool steps. */
export function observeGatewayCredentials() {
  const original = globalThis.fetch;
  const requests: ReturnType<typeof gatewayProvenance>[] = [];
  let failure: Error | undefined;
  let networkFailure: { name: string; elapsedMs: number } | undefined;
  globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (failure) throw failure;
    const started = Date.now();
    let response: Response;
    try { response = await original(input, init); }
    catch (error) {
      networkFailure = { name: error instanceof Error ? error.name : 'unknown', elapsedMs: Date.now() - started };
      throw error;
    }
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (url.hostname === 'ai-gateway.vercel.sh' && method === 'POST' && response.ok) {
      const body = await response.clone().json() as Record<string, unknown>;
      const provenance = gatewayProvenance(body['providerMetadata'] ?? body['provider_metadata'],
        typeof body['model'] === 'string' ? body['model'] : 'unreported');
      requests.push(provenance);
      if (provenance.credentialType !== 'byok') {
        failure = new Error('Gateway validation stopped: BYOK was not verified for this inference');
        throw failure;
      }
    }
    return response;
  }, original) as typeof fetch;
  return { requests, get diagnostic() { return { networkFailure, byokFailure: Boolean(failure) }; },
    restore() { globalThis.fetch = original; }, assertVerified() {
    if (failure) throw failure;
    if (!requests.length) throw new Error('No Gateway inference was observed');
  } };
}
