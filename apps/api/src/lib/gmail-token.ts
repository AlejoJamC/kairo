import { supabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Gmail token management — ADR-022 Phase 5
//
// Single source of truth: oauth_credentials (account-centric, Level 4).
// gmail_accounts has been dropped (Phase 5 migration).
// ---------------------------------------------------------------------------

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

async function refreshGmailToken(
  accountId: string,
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
    .from("oauth_credentials")
    .update({ access_token_enc: newAccessToken, expires_at: expiresAt })
    .eq("account_id", accountId)
    .eq("provider", "gmail");

  return newAccessToken;
}

/**
 * Returns a valid Gmail access token for the given account.
 * Reads from oauth_credentials (canonical).
 * Refreshes automatically if the stored token is expired or about to expire.
 */
export async function getFreshGmailToken(accountId: string): Promise<string> {
  const { data: cred } = await supabase
    .from("oauth_credentials")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("account_id", accountId)
    .eq("provider", "gmail")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cred) {
    throw new Error(`No Gmail credentials found for account ${accountId}`);
  }

  const expiresAt = cred.expires_at ? new Date(cred.expires_at).getTime() : 0;
  const isExpired = expiresAt < Date.now() + 5 * 60 * 1000;

  if (!isExpired && cred.access_token_enc) {
    return cred.access_token_enc;
  }

  if (!cred.refresh_token_enc) {
    throw new Error(`Gmail token expired and no refresh_token available for account ${accountId}`);
  }

  return refreshGmailToken(accountId, cred.refresh_token_enc);
}

/**
 * Returns the Gmail email address associated with the given account.
 */
export async function getGmailEmailByAccount(accountId: string): Promise<string> {
  const { data: cred } = await supabase
    .from("oauth_credentials")
    .select("external_account_id")
    .eq("account_id", accountId)
    .eq("provider", "gmail")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (cred?.external_account_id as string | undefined) ?? "";
}
