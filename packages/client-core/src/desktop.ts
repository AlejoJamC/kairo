import type { AppFocusPort, ClipboardPort, DesktopHost, HandoffTokens, PlatformPorts, StoragePort } from './platform'

// Desktop platform ports. The desktop shell (a Tauri webview) supplies the two
// capabilities a browser lacks — opening the system browser for OAuth and
// taking the tokens from the kairo:// deep link — and passes in the storage,
// clipboard and focus implementations it already owns. Nothing here touches
// window, document or localStorage directly.

export interface DesktopPlatformDeps {
  storage: StoragePort
  clipboard: ClipboardPort
  appFocus: AppFocusPort
  /** Opens a URL in the system browser. Identity providers reject embedded webviews. */
  openExternal(url: string): void
  /** Tokens delivered by the kairo:// deep link handler, or null. Idempotent. */
  takeHandoffTokens(): Promise<HandoffTokens | null>
  /** Native menu, app icon counter and system notifications. */
  host: DesktopHost
}

export function createDesktopPlatform(deps: DesktopPlatformDeps): PlatformPorts {
  return {
    kind: 'desktop',
    host: deps.host,
    storage: deps.storage,
    clipboard: deps.clipboard,
    appFocus: deps.appFocus,
    navigation: { navigate: (url) => deps.openExternal(url) },
    authHandoff: { takeHandoffTokens: () => deps.takeHandoffTokens() },
  }
}
