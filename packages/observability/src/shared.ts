/**
 * Runtime-agnostic helpers — no Node-only or browser-only APIs. Anything that
 * both `node.ts` and `web.ts` need identically lives here, written once.
 */

/** OTLP/HTTP traces endpoint convention shared by every exporter in this package. */
export function otlpTracesUrl(otlpEndpoint: string): string {
  return `${otlpEndpoint}/v1/traces`;
}
