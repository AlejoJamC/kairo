/**
 * API Client for Dashboard (WebApp)
 *
 * Always uses relative URLs.
 * In dev, Vite proxies:
 * - /api -> @kairo/api service (localhost:3001) — owns /api/v1/* and /api/inngest
 * - /bff -> landing app (localhost:3000) — auth/session/clients/gmail handlers
 * In production, routes are served same-origin.
 */
import { createClient } from "@/lib/supabase/client";
import { env } from "@/env";

export function getApiUrl(): string {
  return "";
}

export function getLandingUrl(path: string): string {
  return `${env.VITE_LANDING_URL}${path}`;
}

/**
 * Make an API call with credentials (cookies) included.
 * Attaches the Supabase access token as Bearer header so Next.js API routes
 * can authenticate regardless of cookie storage (dashboard uses localStorage).
 * Automatically redirects to /wizard on 401 Unauthorized.
 */
export async function apiCall(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;

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

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  // Only force auth redirect for landing-owned BFF session endpoints.
  // For /api/v1 API calls, let the caller handle 401 so product flows
  // (template picker, reply, classify, etc.) don't trigger hard navigation.
  if (response.status === 401 && endpoint.startsWith("/bff/")) {
    window.location.href = getLandingUrl("/wizard/");
    throw new Error("Unauthorized");
  }

  return response;
}
