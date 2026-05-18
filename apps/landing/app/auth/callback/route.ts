import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient as createBaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { dispatchOnboardingClassification } from "@/lib/inngest";
import { getFlag } from "@kairo/feature-flags";
import type { Database } from "@/types/supabase";

// ---------------------------------------------------------------------------
// GET /auth/callback
//
// Handles all four post-OAuth scenarios (KAI-172, updated KAI-218):
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
//     → KAI-218: call provision_account_for_user RPC to create accounts +
//        account_members(owner). Then save Gmail channel and dispatch pipeline.
//        Redirect to /wizard/complete so the owner can name their organisation.
//
// Execution order (KAI-218):
//   exchangeCodeForSession → duplicate check → resolve existing membership
//   → detect pending invitation → accept OR provision new account
//   → save gmail_accounts + support_channels (account_id now guaranteed)
//   → re-verify session (KAI-206) → dispatch Inngest → routing
//
// After the invitation/provision step, membership.account_id is guaranteed
// for all four scenarios that reach the Gmail block.
//
// KAI-206: cookie-buffer pattern.
// `@supabase/auth-helpers-nextjs` writes session cookies via `cookies()` from
// `next/headers`, which is unreliable in Next.js 15 route handlers — failures
// are silently swallowed and the session never reaches the browser. Instead we
// collect cookie writes into a buffer and attach them directly to whatever
// NextResponse we end up returning. Tracked for full migration to @supabase/ssr
// in KAI-207.
// ---------------------------------------------------------------------------

interface BufferedCookie {
  name: string;
  value: string;
  options: Parameters<typeof NextResponse.prototype.cookies.set>[2];
}

function attachCookies(response: NextResponse, jar: BufferedCookie[]): NextResponse {
  for (const { name, value, options } of jar) {
    response.cookies.set(name, value, options);
  }
  return response;
}

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

  // ── Build a request-scoped supabase client with a cookie buffer ──────────
  const requestCookies = new Map<string, string>();
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const pair of cookieHeader.split(/;\s*/)) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    requestCookies.set(pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1)));
  }

  const cookieJar: BufferedCookie[] = [];

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return Array.from(requestCookies, ([name, value]) => ({ name, value }));
        },
        setAll(toSet) {
          for (const c of toSet) {
            requestCookies.set(c.name, c.value);
            cookieJar.push({ name: c.name, value: c.value, options: c.options });
          }
        },
      },
    }
  );

  const admin = createBaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session || !data.user) {
    return NextResponse.redirect(
      `${appUrl}/auth/error?type=session_error&description=${encodeURIComponent(error?.message ?? "Unknown error")}`
    );
  }

  const user = data.user;
  const session = data.session;

  // ── Scenario 2: duplicate detection ──────────────────────────────────────
  if (user.email) {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", user.email)
      .neq("id", user.id)
      .maybeSingle();

    if (existingProfile) {
      await admin.auth.admin.deleteUser(user.id);
      return NextResponse.redirect(`${appUrl}/auth/error?type=duplicate_email`);
    }
  }

  // ── Resolve existing active membership ────────────────────────────────────
  // Distinguishes Scenario 1 (returning user) from Scenarios 3 & 4.
  // We capture whether membership was pre-existing to choose the right redirect
  // at the end — Scenario 4 must go to /wizard/complete, not /auth/handoff.
  const { data: existingMembership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Mutable reference: will be set by invitation acceptance (Scenario 3) or
  // account provisioning (Scenario 4) if no pre-existing membership was found.
  let resolvedAccountId: string | null = existingMembership?.account_id ?? null;

  // ── Scenario 3: auto-accept a pending invitation ──────────────────────────
  // Must run BEFORE provisioning so an invited user never gets a second account.
  let acceptedInvitation = false;
  if (!resolvedAccountId && user.email) {
    const now = new Date().toISOString();

    const { data: invitations } = await supabase
      .from("account_invitations")
      .select("id, account_id, role")
      .eq("email", user.email)
      .gt("expires_at", now)
      .limit(1);

    const invitation = invitations?.[0];

    if (invitation) {
      const { error: insertError } = await supabase.from("account_members").insert({
        account_id: invitation.account_id,
        user_id:    user.id,
        role:       invitation.role,
        status:     "active",
        invited_at: now,
        joined_at:  now,
      });

      if (!insertError) {
        await supabase.from("account_invitations").delete().eq("id", invitation.id);
        resolvedAccountId = invitation.account_id;
        acceptedInvitation = true;
      } else {
        console.error(
          `[KAI-218] failed to insert account_members for invitation ${invitation.id}: ${insertError.message}`
        );
      }
    }
  }

  // ── Scenario 4: brand-new user, no invitation ─────────────────────────────
  // KAI-218: call the RPC created in KAI-217 to provision accounts +
  // account_members(owner, active) atomically. The RPC is idempotent — if the
  // defensive trigger (z_ensure_account_on_signup) already ran it returns the
  // existing account_id without creating duplicates.
  if (!resolvedAccountId) {
    console.info(`[KAI-218] provisioning new account for user=${user.id} email=${user.email ?? "unknown"}`);

    const { data: newAccountId, error: rpcError } = await admin.rpc(
      "provision_account_for_user",
      { p_user_id: user.id }
    );

    if (rpcError || !newAccountId) {
      console.error(
        `[KAI-218] provisioning failed for user=${user.id}: ${rpcError?.message ?? "no account_id returned"}`
      );
      return attachCookies(
        NextResponse.redirect(`${appUrl}/auth/error?type=provisioning_failed`),
        cookieJar
      );
    }

    resolvedAccountId = newAccountId as string;
    console.info(`[KAI-218] provisioned account_id=${resolvedAccountId} for user=${user.id}`);
  }

  // ── Save Gmail OAuth tokens (gmail_accounts + support_channels) ─────────
  // resolvedAccountId is guaranteed at this point for all scenarios.
  // provider_token is only present when the user re-consented to Gmail scopes.
  if (session.provider_token && user.email) {
    await supabase.from("gmail_accounts").upsert({
      user_id:       user.id,
      account_id:    resolvedAccountId,
      email:         user.email,
      access_token:  session.provider_token,
      refresh_token: session.provider_refresh_token ?? null,
      expires_at:    new Date(Date.now() + 3600 * 1000).toISOString(),
    }, { onConflict: "user_id,email" });

    // KAI-234 dual-write: canonical OAuth credentials layer (ADR-022 Level 4).
    // Kept in sync with gmail_accounts until Phase 5 drops the legacy table.
    await supabase.from("oauth_credentials").upsert({
      account_id:           resolvedAccountId,
      provider:             "gmail",
      granted_by_user_id:   user.id,
      external_account_id:  user.email,
      access_token_enc:     session.provider_token,
      refresh_token_enc:    session.provider_refresh_token ?? null,
      expires_at:           new Date(Date.now() + 3600 * 1000).toISOString(),
    }, { onConflict: "account_id,provider,external_account_id" });

    // KAI-173: register the inbox as a support channel
    await supabase.from("support_channels").upsert({
      account_id:    resolvedAccountId,
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

    // ── KAI-206 (B1): verify session is still valid before kicking off work ──
    // Original approach called supabase.auth.getUser(), but that round-trip fails
    // when the request carries stale/expired cookies: the auth-helpers client enters
    // an unauthenticated state after failed refresh attempts, and getUser() returns
    // "Auth session missing!" even though exchangeCodeForSession succeeded.
    // Fix: use the session/user we already validated at line 114 directly.
    // The cookie buffer (cookieJar) holds the new session and will reach the browser
    // via attachCookies() — no second round-trip is needed to confirm that.
    if (!session.access_token || session.user.id !== user.id) {
      console.error(
        `[KAI-206] session state inconsistent for user ${user.id} — access_token or user mismatch`
      );
      return attachCookies(
        NextResponse.redirect(`${appUrl}/auth/error?type=session_error&description=verification_failed`),
        cookieJar
      );
    }

    // ── KAI-202: trigger AI classification pipeline ────────────────────────
    try {
      await dispatchOnboardingClassification({
        userId:           user.id,
        accountId:        resolvedAccountId,
        gmailAccessToken: session.provider_token,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[KAI-202] dispatch wrapper threw: ${msg}`);
    }
  }

  // ── Routing ───────────────────────────────────────────────────────────────
  // Scenario 1: returning user with pre-existing membership
  if (existingMembership) {
    if (getFlag("enable_detection_ui")) {
      return attachCookies(NextResponse.redirect(`${appUrl}/wizard/detect`), cookieJar);
    }
    return attachCookies(NextResponse.redirect(`${appUrl}/auth/handoff`), cookieJar);
  }

  // Scenario 3: invitation just accepted — account already existed, skip wizard
  if (acceptedInvitation) {
    return attachCookies(NextResponse.redirect(`${appUrl}/auth/handoff`), cookieJar);
  }

  // Scenario 4: account just provisioned — send to wizard to name the organisation
  return attachCookies(NextResponse.redirect(`${appUrl}/wizard/complete`), cookieJar);
}
