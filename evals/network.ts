import { gatewayProvenance } from '../packages/intelligence/src/providers/gateway/client';

export interface Inference {
  status: number;
  costUsd: number | null;
  credentialType: string | null;
}

/** Closed network boundary: no product database, telemetry or direct remote provider. */
export function guardNetwork(maxRequests: number, transport: typeof fetch = globalThis.fetch) {
  const requests: Inference[] = [];
  const responses: unknown[] = [];
  let stopped = false;
  const guarded = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (stopped) throw new Error('Evaluation network stopped');
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const gateway = url.origin === 'https://ai-gateway.vercel.sh';
    const ollama = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.port === '11434';
    if (!(gateway || ollama) || !['GET', 'POST'].includes(method)) { stopped = true; throw new Error('Evaluation destination rejected'); }
    const inference = method === 'POST';
    if (inference && requests.length >= maxRequests) { stopped = true; throw new Error('Evaluation request limit reached'); }
    const entry: Inference = { status: 0, costUsd: null, credentialType: null };
    if (inference) requests.push(entry);
    try {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const response = await transport(input, { ...init, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000) });
      entry.status = response.status;
      if (!response.ok) throw new Error('Evaluation transport failed');
      if (inference && gateway) {
        const body = await response.clone().json() as Record<string, unknown>;
        responses.push(body);
        const provenance = gatewayProvenance(body['providerMetadata'] ?? body['provider_metadata'], 'evaluation');
        entry.costUsd = provenance.costUsd;
        entry.credentialType = provenance.credentialType;
        if (entry.credentialType !== 'byok') throw new Error('Evaluation BYOK not verified');
      }
      return response;
    } catch { stopped = true; throw new Error('Evaluation network stopped'); }
  }, transport) as typeof fetch;
  return { fetch: guarded, requests, responses, get stopped() { return stopped; } };
}
