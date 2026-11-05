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
  takeHandoffTokens(): Promise<HandoffTokens | null>;
}

/** What only the desktop shell can do: the native menu, the app icon counter and system notifications. */
export interface DesktopHost {
  os: "macos" | "windows" | "linux";
  authDiagnostic?(stage: string): void;
  /** Draws the counter on the app icon; null clears it. */
  setBadge(count: number | null): void;
  /** Replaces the native menu bar; the argument is the menu groups as JSON. */
  setMenu(groupsJson: string): void;
  /** Calls the listener with the id of every native menu item the person picks. Returns the unsubscribe function. */
  onMenuAction(listener: (id: string) => void): () => void;
  /** Starts waiting on the loopback address for the browser sign-in to hand over the session; resolves with the port. */
  startSignInListener(): Promise<number>;
  /** Sets the smallest size the window can take, without resizing it. */
  setMinWindowSize(minWidth: number, minHeight: number): void;
  /** Resizes the window (logical pixels) and sets the smallest size it can take. */
  setWindowSize(width: number, height: number, minWidth: number, minHeight: number): void;
  /** Shows a system notification. */
  notify(title: string, body: string): void;
}

export interface PlatformPorts {
  /** The host: the browser or the desktop shell. */
  kind: "web" | "desktop";
  /** The desktop shell's own capabilities; null in the browser. */
  host: DesktopHost | null;
  storage: StoragePort;
  navigation: NavigationPort;
  clipboard: ClipboardPort;
  appFocus: AppFocusPort;
  authHandoff: AuthHandoffPort;
}
