import type { DesktopHost, PlatformPorts } from './platform'
import { createWebPlatform } from './web'
import { createDesktopPlatform } from './desktop'

// The desktop shell injects this bridge before the dashboard bundle runs, so
// the same bundle picks the desktop ports (system browser, kairo:// deep link)
// instead of the web ones. The web build never sets it and keeps the web ports.
interface DesktopBridge extends DesktopHost {
  openExternal(url: string): void
  takeHandoffTokens(): Promise<{ access_token: string; refresh_token: string } | null>
}

/** Selects the platform for the current host: the desktop ports when the
 * desktop shell injected its bridge, otherwise the browser ports. */
export function createPlatform(): PlatformPorts {
  const bridge = (globalThis as { __KAIRO_DESKTOP__?: DesktopBridge }).__KAIRO_DESKTOP__
  if (bridge) {
    const web = createWebPlatform()
    return createDesktopPlatform({
      storage: web.storage,
      clipboard: web.clipboard,
      appFocus: web.appFocus,
      openExternal: bridge.openExternal,
      takeHandoffTokens: bridge.takeHandoffTokens,
      host: { os: bridge.os, authDiagnostic: bridge.authDiagnostic, setBadge: bridge.setBadge, setMenu: bridge.setMenu, setWindowSize: bridge.setWindowSize, setMinWindowSize: bridge.setMinWindowSize, startSignInListener: bridge.startSignInListener, onMenuAction: bridge.onMenuAction, notify: bridge.notify },
    })
  }
  return createWebPlatform()
}
