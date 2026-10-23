import type { PlatformPorts } from "./platform";

export interface ClientCoreConfig {
  /** Origin that serves /api/* ("" = same origin as the app). */
  apiBaseUrl: string;
  /** Origin that serves /bff/* ("" = same origin as the app). */
  bffBaseUrl: string;
  /** Origin of the sign-in and onboarding surface. */
  landingUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  platform: PlatformPorts;
}

let current: ClientCoreConfig | null = null;

export function initClientCore(config: ClientCoreConfig): void {
  current = config;
}

export function getClientConfig(): ClientCoreConfig {
  if (!current) {
    throw new Error("client-core is not initialized: call initClientCore() before use");
  }
  return current;
}

export function getPlatform(): PlatformPorts {
  return getClientConfig().platform;
}

/** True inside the desktop shell, where sign-in is the app's own view and the system browser handles OAuth. */
export function isDesktop(): boolean {
  return getPlatform().kind === "desktop";
}
