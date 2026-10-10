import { resolveModelRoute } from '@kairo/intelligence';

/** Configured classification model for failure records without a provider response. */
export function resolveModelVersion(): string {
  try { return resolveModelRoute('classification').model; }
  catch { return 'unconfigured'; }
}
