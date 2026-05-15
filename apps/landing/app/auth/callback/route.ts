import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// GET /auth/callback
//
// Handles all four post-OAuth scenarios (KAI-172):
//
//  1. Email exists + same provider (Google)
//     → Supabase logs them in normally. User has account_members → dashboard.
//
//  2. Email exists with email/pass + Google OAuth attempted
//     → Supabase (with PREVENT_DUPLICATE_EMAILS=true) rejects with ?error=.
//     → We redirect to /auth/error?type=duplicate_email.
//     → NOTE: PREVENT_DUPLICATE_EMAILS must be enabled in Supabase dashboard.
//
//  3. Email has pending invitation + Google OAuth
//     → User is created/logged in. We auto-accept the invitation, create
//        account_members, delete the invitation, redirect to dashboard.
//
//  4. Brand-new user, no invitation
//     → Redirect to /wizard/complete (Gmail connection + account setup).
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  // ── Handle OAuth-level errors (Supabase redirects these as query params) ──
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDesc = requestUrl.searchParams.get("error_description") ?? "";

  if (oauthError) {
    // Scenario 2: Supabase blocked the sign-in because the email already
    // exists with a different provider (PREVENT_DUPLICATE_EMAILS enabled).
    const isDuplicate =
      oauthErrorDesc.toLowerCase().includes("already registered") ||
      oauthErrorDesc.toLowerCase().includes("already been registered") ||
      oauthErrorDesc.toLowerCase().includes("user already exists");

    if (isDuplicate) {
      return NextResponse.redirect(`${appUrl}/auth/error?type=duplicate_email`);
    }

    // Generic OAuth error — show a user-friendly error page.
    return NextResponse.redirect(
      `${appUrl}/auth/error?type=oauth_error&description=${encodeURIComponent(oauthErrorDesc || oauthError)}`
    );
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    // No code and no error — likely a direct navigation to /auth/callback.
    return NextResponse.redirect(`${appUrl}/wizard`);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session || !data.user) {
    return NextResponse.redirect(
      `${appUrl}/auth/error?type=session_error&description=${encodeURIComponent(error?.message ?? "Unknown error")}`
    );
  }

  const user = data.user;
  const session = data.session;

  // ── Save Gmail OAuth tokens if present (Gmail connection flow) ────────────
  // provider_token is present only when the OAuth scope includes Gmail.
  if (session.provider_token && user.email) {
    await supabase.from("gmail_accounts").upsert({
      user_id:       user.id,
      email:         user.email,
      access_token:  session.provider_token,
      refresh_token: session.provider_refresh_token ?? null,
      expires_at:    new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    await supabase.from("profiles").update({ gmail_connected: true }).eq("id", user.id);
  }

  // ── Scenario 1 & returning users: check existing account membership ───────
  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership) {
    // Already a member of an account — skip onboarding, go straight to dashboard.
    return NextResponse.redirect(`${appUrl}/auth/handoff`);
  }

  // ── Scenario 3: auto-accept a pending invitation ──────────────────────────
  if (user.email) {
    const now = new Date().toISOString();

    const { data: invitations } = await supabase
      .from("account_invitations")
      .select("id, account_id, role")
      .eq("email", user.email)
      .gt("expires_at", now)
      .limit(1);

    const invitation = invitations?.[0];

    if (invitation) {
      // Insert account_members — allowed by "Users can accept own invitation" RLS policy.
      await supabase.from("account_members").insert({
        account_id: invitation.account_id,
        user_id:    user.id,
        role:       invitation.role,
        status:     "active",
        invited_at: now,
        joined_at:  now,
      });

      // Delete used invitation — allowed by "Invited user can delete own invitation" RLS policy.
      await supabase.from("account_invitations").delete().eq("id", invitation.id);

      return NextResponse.redirect(`${appUrl}/auth/handoff`);
    }
  }

  // ── Scenario 4: brand-new user, no invitation ─────────────────────────────
  // Route through the Gmail connection + account setup wizard.
  return NextResponse.redirect(`${appUrl}/wizard/complete`);
}
