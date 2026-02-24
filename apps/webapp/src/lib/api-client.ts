/**
 * API Client for Dashboard (WebApp)
 *
 * Always uses relative URLs — Vite proxy forwards /api to Next.js in dev,
 * Vercel serves everything same-origin in production.
 */
import { createClient } from "@/lib/supabase/client";

export function getApiUrl(): string {
  return "";
}

export function getLandingUrl(path: string): string {
  const base = import.meta.env.VITE_LANDING_URL || "";
  return `${base}${path}`;
}

/**
 * Make an API call with credentials (cookies) included.
 * Attaches the Supabase access token as Bearer header so Next.js API routes
 * can authenticate regardless of cookie storage (webapp uses localStorage).
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

  if (response.status === 401) {
    window.location.href = getLandingUrl("/wizard/");
    throw new Error("Unauthorized");
  }

  return response;
}
