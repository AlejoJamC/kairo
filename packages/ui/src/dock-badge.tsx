// Counter on the desktop app icon. The system draws it; Kairo only passes the
// number (the same number as the sidebar bell). No colors of its own.

/** The host that renders the badge on the app icon (Tauri in the desktop shell). */
export interface DockBadgeHost {
  setBadge(count: number | null): void
}

/** The count the OS should show, or null to clear. Zero and non-finite values
 * mean no counter. */
export function dockBadgeCount(count: number): number | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count
}

/** The text the OS draws: 1–99 the number, 100 or more "99+". */
export function dockBadgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  return count >= 100 ? '99+' : String(count)
}

/** Windows taskbar overlay: above 9 only the circle is drawn and the full
 * number moves to the icon description ("Kairo, N unread"). */
export function dockBadgeWindowsOverlay(count: number): { number: boolean; description: string } {
  if (!Number.isFinite(count) || count <= 0) return { number: false, description: '' }
  return { number: count <= 9, description: `Kairo, ${count} unread` }
}

/** Pushes the current count to the host (a no-op in a webview with no host). */
export function syncDockBadge(host: DockBadgeHost | null, count: number): void {
  host?.setBadge(dockBadgeCount(count))
}
