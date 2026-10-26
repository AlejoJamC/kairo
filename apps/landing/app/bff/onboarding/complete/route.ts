import { createClient, getUserFromRequest } from "@/lib/supabase/server";
import { dispatchOnboardingCompleted } from "@/lib/inngest";
import { isIndustryChoice } from "@kairo/types/industry";
import { NextResponse } from "next/server";

const BUSINESS_CONTEXT_MAX = 2500;

// POST /bff/onboarding/complete
// Records the industry and business context the owner chose (both optional;
// skipping records the default industry and no business context) and marks the onboarding as finished. The record is
// written once: a repeated call keeps what was saved, so later refinements are
// never overwritten by a retry.
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await getUserFromRequest(request, supabase);
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { industry?: unknown; business_context?: unknown };
    if (body.industry != null && !isIndustryChoice(body.industry)) {
      return NextResponse.json({ error: "Invalid industry" }, { status: 400 });
    }
    if (body.business_context != null && typeof body.business_context !== "string") {
      return NextResponse.json({ error: "Invalid business context" }, { status: 400 });
    }
    const businessContext = body.business_context?.trim().slice(0, BUSINESS_CONTEXT_MAX) || null;
    // Skipping records the default choice, so an account that skipped is told apart
    // from one that predates the setting (which keeps a null industry).
    const industry = body.industry ?? "other";

    const { data: member } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: "No active account where you are owner or admin" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("accounts")
      .update({
        industry,
        onboarding_completed_at: now,
        ...(businessContext && {
          business_context: businessContext,
          business_context_source: "manual",
          business_context_updated_at: now,
        }),
      })
      .eq("id", member.account_id)
      .is("onboarding_completed_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) {
      return NextResponse.json({ error: "Failed to save the onboarding" }, { status: 500 });
    }

    // A repeated call finds the record already written; the event is sent again
    // only so a first dispatch that failed can still reach the pipeline.
    await dispatchOnboardingCompleted(member.account_id);
    return NextResponse.json({ success: true, account_id: member.account_id, already_completed: !updated });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
