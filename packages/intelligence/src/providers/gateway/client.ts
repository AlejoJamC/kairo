import { createGateway, GatewayError, type GatewayProvider } from '@ai-sdk/gateway';
import { APICallError, NoObjectGeneratedError } from 'ai';
import { z, ZodError } from 'zod';
import { ProviderError } from '../base';

export const TYPESAFE_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/typesafe';

/** Credentials and request bodies must never follow an HTTP redirect. */
export const gatewayFetch = Object.assign(function gatewayFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) return Promise.reject(byokEnforcementError());
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000), redirect: 'error' });
}, fetch);

function byokEnforcementError(): ProviderError {
  return new ProviderError('Remote inference blocked: Gateway cannot enforce BYOK-only credentials without system fallback', false);
}

const RoutingMetadataSchema = z.object({
  gateway: z.object({
    cost: z.union([z.number(), z.string()]).optional(),
    routing: z.object({
      canonicalSlug: z.string().optional(),
      finalProvider: z.string().optional(),
      modelAttempts: z.array(z.object({
        providerAttempts: z.array(z.object({ provider: z.string(),
          credentialType: z.enum(['byok', 'system']).optional(), success: z.boolean() })).optional(),
      })).optional(),
    }).optional(),
  }).optional(),
});

const ProviderRoutesSchema = z.record(z.string(), z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1));

/** Restrict serving providers; this does not disable Gateway's credential fallback. */
export function gatewayProviderOptions(model: string, env: Record<string, string | undefined> = process.env) {
  const owner = model.split('/')[0];
  if (!owner || !model.includes('/') || !/^[a-z0-9-]+$/.test(owner)) {
    throw new ProviderError('Gateway model requires a provider/model identifier', false);
  }
  let routes: z.infer<typeof ProviderRoutesSchema> = {};
  if (env['AI_GATEWAY_PROVIDER_ROUTES']) {
    try { routes = ProviderRoutesSchema.parse(JSON.parse(env['AI_GATEWAY_PROVIDER_ROUTES'])); }
    catch { throw new ProviderError('Invalid AI_GATEWAY_PROVIDER_ROUTES configuration', false); }
  }
  return { gateway: { only: routes[model] ?? routes[owner] ?? [owner] } };
}

export function gatewayProvenance(metadata: unknown, reportedModel: string) {
  const parsed = RoutingMetadataSchema.safeParse(metadata);
  const gateway = parsed.success ? parsed.data.gateway : undefined;
  const cost = gateway?.cost === undefined ? null : Number(gateway.cost);
  const winner = gateway?.routing?.modelAttempts?.flatMap((attempt) => attempt.providerAttempts ?? [])
    .filter((attempt) => attempt.success).at(-1);
  return {
    model: gateway?.routing?.canonicalSlug ?? reportedModel,
    costUsd: cost !== null && Number.isFinite(cost) && cost >= 0 ? cost : null,
    inferenceProvider: winner?.provider ?? gateway?.routing?.finalProvider ?? null,
    credentialType: winner?.credentialType ?? null,
  };
}

export function gatewayKey(env: Record<string, string | undefined> = process.env): string {
  const key = env['AI_GATEWAY_API_KEY'];
  if (!key) throw new ProviderError('AI_GATEWAY_API_KEY is required for remote models', false);
  return key;
}

export function gatewayError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (NoObjectGeneratedError.isInstance(error) && error.finishReason === 'length') {
    return new ProviderError('Gateway structured output exceeded its token budget', false);
  }
  if (NoObjectGeneratedError.isInstance(error) || error instanceof ZodError) {
    return new ProviderError('Gateway output did not match the requested schema', false);
  }
  if (GatewayError.isInstance(error)) {
    return new ProviderError(`Gateway request failed (HTTP ${error.statusCode})`, error.isRetryable);
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    const seconds = Number(error.responseHeaders?.['retry-after']);
    return new ProviderError(
      `Gateway request failed${status ? ` (HTTP ${status})` : ''}`,
      status === 429 || (status !== undefined && status >= 500) || error.isRetryable,
      Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
    );
  }
  return new ProviderError('Gateway request failed', true);
}

interface CatalogState {
  catalog?: { expires: number; models: Awaited<ReturnType<GatewayProvider['getAvailableModels']>>['models'] };
  loading?: ReturnType<GatewayProvider['getAvailableModels']>;
}
const catalogs = new WeakMap<typeof fetch, Map<string, CatalogState>>();

export class GatewayClient {
  readonly sdk: GatewayProvider;
  private readonly state: CatalogState;
  private readonly transport: typeof fetch;

  constructor(apiKey: string, transport: typeof fetch = gatewayFetch) {
    this.transport = transport;
    this.sdk = createGateway({ apiKey, fetch: transport });
    let entries = catalogs.get(transport);
    if (!entries) { entries = new Map(); catalogs.set(transport, entries); }
    let state = entries.get(apiKey);
    if (!state) { state = {}; entries.set(apiKey, state); }
    this.state = state;
  }

  async requireModel(model: string, capability: 'language' | 'embedding' | 'decision'): Promise<void> {
    if (this.transport === gatewayFetch) throw byokEnforcementError();
    try {
      if (!this.state.catalog || this.state.catalog.expires <= Date.now()) {
        this.state.loading ??= this.sdk.getAvailableModels();
        try {
          const { models } = await this.state.loading;
          this.state.catalog = { expires: Date.now() + 300_000, models };
        } finally {
          this.state.loading = undefined;
        }
      }
      const entry = this.state.catalog.models.find((item) => item.id === model);
      const modelType = entry?.modelType ?? 'language';
      const compatible = capability === 'decision'
        ? modelType === 'decision' || modelType === 'evaluation'
        : modelType === capability;
      if (!entry || !compatible) {
        throw new ProviderError('Configured model is unavailable for the requested Gateway capability', false);
      }
    } catch (error) {
      throw gatewayError(error);
    }
  }
}
