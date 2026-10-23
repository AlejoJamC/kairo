/** Query parameter that marks a sign-in started from the desktop app. */
export const DESKTOP_PARAM = "destino";
export const DESKTOP_VALUE = "desktop";

export function isDesktopDestination(value: string | null | undefined): boolean {
  return value === DESKTOP_VALUE;
}

/** Address the Google callback returns to; from the desktop app it remembers the destination. */
export function callbackPath(desktop: boolean): string {
  return desktop ? `/auth/callback?${DESKTOP_PARAM}=${DESKTOP_VALUE}` : "/auth/callback";
}

/** Address of the hand-off page for the destination. */
export function handoffPath(desktop: boolean): string {
  return desktop ? `/auth/handoff?${DESKTOP_PARAM}=${DESKTOP_VALUE}` : "/auth/handoff";
}

/** The kairo:// link that returns the session to the desktop app. */
export function desktopHandoffUrl(session: { access_token: string; refresh_token: string }): string {
  return `kairo://auth?access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
}
