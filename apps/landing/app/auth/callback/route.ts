import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { dispatchOnboardingClassification } from "@/lib/inngest";

// ---------------------------------------------------------------------------
// GET /auth/callback
//
// Handles all four post-OAuth scenarios (KAI-172):
//
//  1. Email exists + same provider (Google)
//     → Supabase logs them in normally. User has account_members → dashboard.
//
//  2. Email exists with email/pass + Google OAuth attempted
//     → Supabase creates a duplicate auth.user (no native UI toggle to prevent
//        this). We detect it by checking if another profile with the same email
//        already exists, then delete the duplicate and redirect to /auth/error.
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

  // ── Handle any OAuth-level error params ──────────────────────────────────
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDesc = requestUrl.searchParams.get("error_description") ?? "";

  if (oauthError) {
    return NextResponse.redirect(
      `${appUrl}/auth/error?type=oauth_error&description=${encodeURIComponent(oauthErrorDesc || oauthError)}`
    );
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${appUrl}/wizard`);
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session || !data.user) {
    return NextResponse.redirect(
      `${appUrl}/auth/error?type=session_error&description=${encodeURIComponent(error?.message ?? "Unknown error")}`
    );
  }

  const user = data.user;
  const session = data.session;

  // ── Scenario 2: duplicate detection ──────────────────────────────────────
  // Supabase has no native "prevent duplicate emails across providers" toggle
  // in the current dashboard. We detect duplicates post-creation:
  // if another profile with the same email already exists (different user_id),
  // then a second auth.user was just created erroneously — delete it and bail.
  if (user.email) {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", user.email)
      .neq("id", user.id)
      .maybeSingle();

    if (existingProfile) {
      // Delete the duplicate auth.user (the one just created by this OAuth flow).
      await admin.auth.admin.deleteUser(user.id);
      return NextResponse.redirect(`${appUrl}/auth/error?type=duplicate_email`);
    }
  }

  // ── Resolve active account membership first (needed for channel creation) ──
  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // ── Save Gmail OAuth tokens (gmail_accounts + support_channels) ─────────
  if (session.provider_token && user.email) {
    const accountId = membership?.account_id;

    await supabase.from("gmail_accounts").upsert({
      user_id:       user.id,
      account_id:    accountId,
      email:         user.email,
      access_token:  session.provider_token,
      refresh_token: session.provider_refresh_token ?? null,
      expires_at:    new Date(Date.now() + 3600 * 1000).toISOString(),
    }, { onConflict: "user_id,email" });

    // KAI-173: also register the channel in support_channels
    if (accountId) {
      await supabase.from("support_channels").upsert({
        account_id:    accountId,
        channel_type:  "gmail",
        email_address: user.email,
        oauth_tokens:  {
          access_token:  session.provider_token,
          refresh_token: session.provider_refresh_token ?? null,
          expires_at:    new Date(Date.now() + 3600 * 1000).toISOString(),
        },
        connected_by:  user.id,
        is_primary:    true,
        is_active:     true,
      }, { onConflict: "account_id,email_address" });
    }

    // ── KAI-202: trigger AI classification pipeline ────────────────────────
    try {
      await dispatchOnboardingClassification({
        userId: user.id,
        accountId: accountId ?? null,
        gmailAccessToken: session.provider_token,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[KAI-202] dispatch wrapper threw: ${msg}`);
    }
  } else {
    console.warn("[callback] SKIPPED token save — provider_token:", session.provider_token, "email:", user.email);
  }

  if (membership) {
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
      await supabase.from("account_members").insert({
        account_id: invitation.account_id,
        user_id:    user.id,
        role:       invitation.role,
        status:     "active",
        invited_at: now,
        joined_at:  now,
      });

      await supabase.from("account_invitations").delete().eq("id", invitation.id);

      return NextResponse.redirect(`${appUrl}/auth/handoff`);
    }
  }

  // ── Scenario 4: brand-new user, no invitation ─────────────────────────────
  return NextResponse.redirect(`${appUrl}/wizard/complete`);
}
