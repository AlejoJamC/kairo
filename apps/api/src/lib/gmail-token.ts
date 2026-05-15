import { supabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Gmail token management — refresh when expired
//
// Google access tokens last ~1 hour. The pipeline reads from gmail_accounts
// and must always have a fresh token before calling Gmail API.
// ---------------------------------------------------------------------------

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

async function refreshGmailToken(
  userId: string,
  refreshToken: string
): Promise<string> {
  const clientId = process.env["NEXT_PUBLIC_GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for token refresh");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await res.json() as RefreshResponse;

  if (!res.ok || data.error) {
    console.error("[gmail-token] refresh failed:", res.status, data.error, data.error_description);
    throw new Error(`Token refresh failed: ${data.error_description ?? data.error ?? res.statusText}`);
  }

  const newAccessToken = data.access_token;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase
    .from("gmail_accounts")
    .update({ access_token: newAccessToken, expires_at: expiresAt })
    .eq("user_id", userId);

  return newAccessToken;
}

/**
 * Returns a valid Gmail access token for the given user.
 * Refreshes automatically if the stored token is expired or about to expire.
 */
export async function getFreshGmailToken(userId: string): Promise<string> {
  const { data: account } = await supabase
    .from("gmail_accounts")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (!account) {
    throw new Error(`No Gmail account found for user ${userId}`);
  }

  // Refresh if expired or expiring within 5 minutes
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
  const isExpired = expiresAt < Date.now() + 5 * 60 * 1000;

  if (!isExpired && account.access_token) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error(`Gmail token expired and no refresh_token available for user ${userId}`);
  }

  return refreshGmailToken(userId, account.refresh_token);
}
