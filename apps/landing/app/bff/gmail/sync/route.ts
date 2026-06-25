import { createClient, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest";

// ---------------------------------------------------------------------------
// KAI-248 — Manual "Sync Gmail" trigger
//
// This route no longer lists/imports Gmail messages itself. The old logic
// (list in:inbox, no pre-filter, never reopened tickets) is retired in favor
// of the new independent Gmail poll worker (apps/api/src/functions/inbound/
// gmail-poll.ts), which applies preFilterEmail as a gate, handles threading,
// and reopens tickets on customer replies.
//
// This route's only job: authenticate, resolve accountId, verify an active
// Gmail channel_integration exists, and emit the same per-account event the
// cron fan-out uses (inbound/gmail.poll.requested). The worker does the rest.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate — Bearer token (dashboard) or cookie fallback.
    const {
      data: { user },
      error: authError,
    } = await getUserFromRequest(request, supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Resolve accountId from membership.
    const { data: memberRow } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const accountId = memberRow?.account_id;
    if (!accountId) {
      return NextResponse.json({ error: "No active account found" }, { status: 403 });
    }

    // 3. Verify an active Gmail channel_integration exists for this account.
    const { data: channelRow } = await supabase
      .from("channel_integrations")
      .select("id")
      .eq("account_id", accountId)
      .eq("provider", "gmail")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!channelRow) {
      return NextResponse.json(
        { error: "Gmail account not connected" },
        { status: 400 }
      );
    }

    // 4. Emit the same per-account poll event the cron fan-out uses.
    try {
      await inngest.send({
        name: "inbound/gmail.poll.requested",
        data: { accountId },
      });
    } catch (err) {
      console.error(`[gmail-sync] failed to dispatch poll event for account ${accountId}:`, err);
      return NextResponse.json(
        { error: "Failed to trigger Gmail sync. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, dispatched: true });
  } catch (error) {
    console.error("Gmail sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync Gmail. Please try again." },
      { status: 500 }
    );
  }
}
