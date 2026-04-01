import { env } from "@/env";

/**
 * API Configuration
 *
 * Always returns '' (relative URL) — Next.js API routes / serverless functions
 * are served on the same origin. There is no separate backend URL.
 */
export function getApiUrl(): string {
  return "";
}

/**
 * Helper for making API calls with the correct base URL.
 */
export async function apiCall(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${getApiUrl()}${endpoint}`;

  return fetch(url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
}

/**
 * Get the dashboard URL based on environment.
 * In dev you may want http://localhost:5173/dashboard; in prod it's /dashboard.
 */
export function getDashboardUrl(): string {
  return env.NEXT_PUBLIC_DASHBOARD_URL;
}
