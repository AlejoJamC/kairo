/**
 * API Client for Dashboard (WebApp)
 *
 * Always uses relative URLs — Vite proxy forwards /api to Next.js in dev,
 * Vercel serves everything same-origin in production.
 */
export function getApiUrl(): string {
  return "";
}

export function getLandingUrl(path: string): string {
  const base = import.meta.env.VITE_LANDING_URL || "";
  return `${base}${path}`;
}

/**
 * Make an API call with credentials (cookies) included.
 * Automatically redirects to /wizard on 401 Unauthorized.
 */
export async function apiCall(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
    ...options,
  });

  if (response.status === 401) {
    window.location.href = getLandingUrl("/wizard/");
    throw new Error("Unauthorized");
  }

  return response;
}
