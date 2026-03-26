import { env } from "@/env";

/**
 * API Configuration
 *
 * Returns the base API URL based on environment:
 * - Default: '' (relative, uses Next.js API routes / serverless)
 * - With backend: value of NEXT_PUBLIC_API_URL (e.g. http://localhost:3001)
 */
export function getApiUrl(): string {
  return env.NEXT_PUBLIC_API_URL;
}

/**
 * Helper for making API calls with the correct base URL.
 */
export async function apiCall(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;

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
