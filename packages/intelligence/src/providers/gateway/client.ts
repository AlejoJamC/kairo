import { createGateway, GatewayError, type GatewayProvider } from '@ai-sdk/gateway';
import { APICallError, NoObjectGeneratedError } from 'ai';
import { z, ZodError } from 'zod';
import { ProviderError } from '../base';

export const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
export const TYPESAFE_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/typesafe';

/** Credentials and request bodies must never follow an HTTP redirect. */
export function gatewayFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000), redirect: 'error' });
}

const RoutingMetadataSchema = z.object({
  gateway: z.object({
    cost: z.union([z.number(), z.string()]).optional(),
    routing: z.object({ canonicalSlug: z.string().optional() }).optional(),
  }).optional(),
});

export function gatewayProvenance(metadata: unknown, reportedModel: string) {
  const parsed = RoutingMetadataSchema.safeParse(metadata);
  const gateway = parsed.success ? parsed.data.gateway : undefined;
  const cost = gateway?.cost === undefined ? null : Number(gateway.cost);
  return {
    model: gateway?.routing?.canonicalSlug ?? reportedModel,
    costUsd: cost !== null && Number.isFinite(cost) && cost >= 0 ? cost : null,
  };
}

export function gatewayKey(env: Record<string, string | undefined> = process.env): string {
  const key = env['AI_GATEWAY_API_KEY'];
  if (!key) throw new ProviderError('AI_GATEWAY_API_KEY is required for remote models', false);
  return key;
}

export function gatewayError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
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

  constructor(apiKey: string) {
    this.sdk = createGateway({ apiKey, baseURL: GATEWAY_BASE_URL, fetch: gatewayFetch });
    let entries = catalogs.get(fetch);
    if (!entries) { entries = new Map(); catalogs.set(fetch, entries); }
    let state = entries.get(apiKey);
    if (!state) { state = {}; entries.set(apiKey, state); }
    this.state = state;
  }

  async requireModel(model: string, capability: 'language' | 'embedding' | 'decision'): Promise<void> {
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
      if (!entry || (entry.modelType ?? 'language') !== capability) {
        throw new ProviderError('Configured model is unavailable for the requested Gateway capability', false);
      }
    } catch (error) {
      throw gatewayError(error);
    }
  }
}
