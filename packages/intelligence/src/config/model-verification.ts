import { ProviderConfigurationError } from '../providers/base';
import { GatewayClient, gatewayFetch, gatewayKey } from '../providers/gateway/client';
import { resolveModelRoute } from './model-roles';

export type ModelVerification =
  | { status: 'ok' }
  | { status: 'invalid'; reason: string }
  | { status: 'unverified'; reason: string };

/**
 * Checks the configured classification model before any mail is processed: the
 * route must resolve, and a Gateway model must exist in the live catalog with
 * the capability the classification mode needs. A misconfigured model is
 * `invalid`; a catalog that cannot be reached is `unverified`, since the
 * configuration may well be right.
 */
export async function verifyClassificationModel(
  env: Record<string, string | undefined> = process.env,
  transport: typeof fetch = gatewayFetch,
): Promise<ModelVerification> {
  try {
    const route = resolveModelRoute('classification', env);
    if (route.provider !== 'gateway') return { status: 'ok' };
    const capability = route.capability === 'decision' ? 'decision' : 'language';
    await new GatewayClient(gatewayKey(env), transport).requireModel(route.model, capability);
    return { status: 'ok' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return error instanceof ProviderConfigurationError
      ? { status: 'invalid', reason }
      : { status: 'unverified', reason };
  }
}
