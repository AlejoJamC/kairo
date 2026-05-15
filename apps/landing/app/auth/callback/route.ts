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
  // All session cookies written by exchangeCodeForSession (and any follow-up
  // auth state change) land in `cookieJar` and are attached to the final
  // response before returning.
  const requestCookies = new Map<string, string>();
  for (const c of requestUrl.searchParams.has("__skip_cookies__") ? [] : []) {
    // placeholder; cookies are read from the Request object below
    void c;
  }
  // Read incoming cookies from the Request headers
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
    const accountId = membership?.account_id ?? null;

    if (accountId) {
      await supabase.from("gmail_accounts").upsert({
        user_id:       user.id,
        account_id:    accountId,
        email:         user.email,
        access_token:  session.provider_token,
        refresh_token: session.provider_refresh_token ?? null,
        expires_at:    new Date(Date.now() + 3600 * 1000).toISOString(),
      }, { onConflict: "user_id,email" });

      // KAI-173: also register the channel in support_channels
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

    // ── KAI-206 (B1): re-verify the session is still valid before kicking off
    // background processing. If verification fails the cookie write failed or
    // the session was invalidated mid-callback; we must NOT dispatch Inngest
    // because the user's UI won't be able to see anything we process.
    const { data: verifyData, error: verifyError } = await supabase.auth.getUser();
    if (verifyError || !verifyData.user) {
      console.error(
        `[KAI-206] session re-verification failed for user ${user.id}: ${verifyError?.message ?? "no user returned"}`
      );
      return attachCookies(
        NextResponse.redirect(`${appUrl}/auth/error?type=session_error&description=verification_failed`),
        cookieJar
      );
    }

    // ── KAI-202: trigger AI classification pipeline ────────────────────────
    try {
      await dispatchOnboardingClassification({
        userId: user.id,
        accountId,
        gmailAccessToken: session.provider_token,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[KAI-202] dispatch wrapper threw: ${msg}`);
    }
  }

  if (membership) {
    if (getFlag("enable_detection_ui")) {
      return attachCookies(NextResponse.redirect(`${appUrl}/wizard/detect`), cookieJar);
    }
    return attachCookies(NextResponse.redirect(`${appUrl}/auth/handoff`), cookieJar);
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

      return attachCookies(NextResponse.redirect(`${appUrl}/auth/handoff`), cookieJar);
    }
  }

  // ── Scenario 4: brand-new user, no invitation ─────────────────────────────
  return attachCookies(NextResponse.redirect(`${appUrl}/wizard/complete`), cookieJar);
}
