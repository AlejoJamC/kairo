/**
 * API client shared by every Kairo client.
 *
 * Origins and platform capabilities come from initClientCore(); an empty
 * origin keeps the same-origin behavior of the web build, where /api/* and
 * /bff/* are served next to the app.
 */
import { createClient } from "./supabase";
import { getClientConfig, getPlatform, isDesktop } from "./config";

export function getApiUrl(): string {
  return getClientConfig().apiBaseUrl;
}

export function getLandingUrl(path: string): string {
  return `${getClientConfig().landingUrl}${path}`;
}

/**
 * Sends the person to sign in. The browser app leaves for the sign-in surface;
 * the desktop app shows its own sign-in view instead of opening the system browser.
 */
export function redirectToSignIn(): void {
  if (isDesktop()) return;
  getPlatform().navigation.navigate(getLandingUrl("/wizard/"));
}

function resolveUrl(endpoint: string): string {
  const { apiBaseUrl, bffBaseUrl } = getClientConfig();
  return `${endpoint.startsWith("/bff/") ? bffBaseUrl : apiBaseUrl}${endpoint}`;
}

/**
 * Make an API call with credentials included.
 * Attaches the Supabase access token as Bearer header so the BFF routes can
 * authenticate regardless of cookie storage.
 * Sends the user to the sign-in surface on 401 from a BFF session endpoint.
 */
export async function apiCall(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(resolveUrl(endpoint), {
    credentials: "include",
    ...options,
    headers,
  });

  // A product endpoint can return 401 for its own reasons. Verify the session
  // before treating that response as a sign-out.
  if (response.status === 401 && endpoint.startsWith("/api/") && session) {
    try {
      const { data, error } = await supabase.auth.getUser();
      const invalidSession = (!error && !data.user) || error?.status === 401 || error?.name === "AuthSessionMissingError";
      if (invalidSession) {
        const { data: current } = await supabase.auth.getSession();
        if (!current.session || current.session.access_token === session.access_token) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } finally {
            redirectToSignIn();
          }
        }
      }
    } catch {
      // A temporary auth service failure is not proof that the session is invalid.
    }
  } else if (response.status === 401 && endpoint.startsWith("/api/") && !session) {
    const { data: current } = await supabase.auth.getSession();
    if (!current.session) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        redirectToSignIn();
      }
    }
  }

  if (response.status === 401 && endpoint.startsWith("/bff/")) {
    redirectToSignIn();
    throw new Error("Unauthorized");
  }

  return response;
}
