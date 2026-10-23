/** Query parameters that mark a sign-in started from the desktop app. */
export const DESKTOP_PARAM = "destino";
export const DESKTOP_VALUE = "desktop";
/** The loopback port the desktop app listens on to receive the session. */
export const PORT_PARAM = "puerto";

export function isDesktopDestination(value: string | null | undefined): boolean {
  return value === DESKTOP_VALUE;
}

/** A usable loopback port, or null: digits only, between 1024 and 65535. */
export function parsePort(value: string | null | undefined): number | null {
  if (!value || !/^\d{4,5}$/.test(value)) return null;
  const port = Number(value);
  return port >= 1024 && port <= 65535 ? port : null;
}

function withDesktop(path: string, desktop: boolean, port: number | null): string {
  if (!desktop) return path;
  const params = new URLSearchParams({ [DESKTOP_PARAM]: DESKTOP_VALUE });
  if (port !== null) params.set(PORT_PARAM, String(port));
  return `${path}?${params.toString()}`;
}

/** Address the Google callback returns to; from the desktop app it remembers the destination and the port. */
export function callbackPath(desktop: boolean, port: number | null = null): string {
  return withDesktop("/auth/callback", desktop, port);
}

/** Address of the hand-off page for the destination. */
export function handoffPath(desktop: boolean, port: number | null = null): string {
  return withDesktop("/auth/handoff", desktop, port);
}

type Session = { access_token: string; refresh_token: string };

function tokenQuery(session: Session): string {
  return `access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
}

/** The kairo:// link that returns the session to an installed desktop app. */
export function desktopHandoffUrl(session: Session): string {
  return `kairo://auth?${tokenQuery(session)}`;
}

/** The address the running desktop app listens on: it works with the app in development too. The host is always 127.0.0.1. */
export function loopbackHandoffUrl(port: number, session: Session): string {
  return `http://127.0.0.1:${port}/auth?${tokenQuery(session)}`;
}

/** Where the hand-off page sends the session: the running app's loopback address when it gave a port, otherwise the kairo:// link. */
export function desktopTarget(port: number | null, session: Session): string {
  return port !== null ? loopbackHandoffUrl(port, session) : desktopHandoffUrl(session);
}

/** Cookie that remembers a sign-in started from the desktop app while the person is in the browser. It does not depend on the redirect URL keeping its query. */
export const DESKTOP_COOKIE = "kairo_desktop";

/** The cookie value: the loopback port, or 0 when the app gave none. */
export function desktopCookieValue(port: number | null): string {
  return String(port ?? 0);
}

/** Reads the desktop sign-in from a Cookie header: whether it was started from the app, and its port. */
export function readDesktopCookie(header: string | null | undefined): { desktop: boolean; port: number | null } {
  const match = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${DESKTOP_COOKIE}=`));
  if (!match) return { desktop: false, port: null };
  return { desktop: true, port: parsePort(match.slice(DESKTOP_COOKIE.length + 1)) };
}
