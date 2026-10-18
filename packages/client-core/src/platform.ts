// Platform ports: every capability a client needs from the host environment.
// Web, desktop shells and React Native each supply their own implementation;
// nothing in this package touches window, document or localStorage directly.

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface NavigationPort {
  /**
   * Leaves the app for an external URL (sign-in, OAuth consent). The web
   * adapter navigates the current window; a desktop shell opens the system
   * browser, because identity providers reject embedded webviews.
   */
  navigate(url: string): void;
}

export interface ClipboardPort {
  writeText(text: string): Promise<void>;
}

export interface AppFocusPort {
  /** Calls the listener with true when the app becomes visible or focused and false when it is hidden. Returns the unsubscribe function. */
  subscribe(listener: (visible: boolean) => void): () => void;
}

export interface HandoffTokens {
  access_token: string;
  refresh_token: string;
}

export interface AuthHandoffPort {
  /** Session tokens delivered by the sign-in surface, or null. Idempotent: repeated calls return the same value. */
  takeHandoffTokens(): HandoffTokens | null;
}

export interface PlatformPorts {
  storage: StoragePort;
  navigation: NavigationPort;
  clipboard: ClipboardPort;
  appFocus: AppFocusPort;
  authHandoff: AuthHandoffPort;
}
