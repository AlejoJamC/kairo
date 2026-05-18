import { supabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Gmail token management — ADR-022 Phase 2
//
// Primary source: oauth_credentials (account-centric, Level 4 of ownership hierarchy).
// Fallback:       gmail_accounts (legacy, kept alive until Phase 5 cleanup).
//
// All token reads now take accountId, not userId.  The pipeline functions must
// resolve accountId from account_members before calling these helpers.
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

  // Dual-write: canonical table first, then legacy (ADR-022 Phase 2).
  await supabase
    .from("oauth_credentials")
    .update({ access_token_enc: newAccessToken, expires_at: expiresAt })
    .eq("account_id", accountId)
    .eq("provider", "gmail");

  await supabase
    .from("gmail_accounts")
    .update({ access_token: newAccessToken, expires_at: expiresAt })
    .eq("account_id", accountId);

  return newAccessToken;
}

/**
 * Returns a valid Gmail access token for the given account.
 * Reads from oauth_credentials (canonical) with fallback to gmail_accounts (legacy).
 * Refreshes automatically if the stored token is expired or about to expire.
 */
export async function getFreshGmailToken(accountId: string): Promise<string> {
  // 1. Try oauth_credentials (canonical — ADR-022 Level 4)
  const { data: cred } = await supabase
    .from("oauth_credentials")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("account_id", accountId)
    .eq("provider", "gmail")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cred) {
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

  // 2. Fallback: gmail_accounts (legacy, active until Phase 5)
  console.warn(`[gmail-token] oauth_credentials missing for account=${accountId} — falling back to gmail_accounts`);

  const { data: legacy } = await supabase
    .from("gmail_accounts")
    .select("access_token, refresh_token, expires_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!legacy) {
    throw new Error(`No Gmail account found for account ${accountId}`);
  }

  const expiresAt = legacy.expires_at ? new Date(legacy.expires_at).getTime() : 0;
  const isExpired = expiresAt < Date.now() + 5 * 60 * 1000;

  if (!isExpired && legacy.access_token) {
    return legacy.access_token;
  }

  if (!legacy.refresh_token) {
    throw new Error(`Gmail token expired and no refresh_token available for account ${accountId}`);
  }

  return refreshGmailToken(accountId, legacy.refresh_token);
}

/**
 * Returns the Gmail email address associated with the given account.
 * Reads from oauth_credentials.external_account_id (canonical) with fallback to gmail_accounts.email.
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

  if (cred?.external_account_id) {
    return cred.external_account_id;
  }

  // Fallback: gmail_accounts (legacy)
  console.warn(`[gmail-token] oauth_credentials missing for account=${accountId} — falling back to gmail_accounts for email`);

  const { data: legacy } = await supabase
    .from("gmail_accounts")
    .select("email")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (legacy?.email as string | undefined) ?? "";
}
