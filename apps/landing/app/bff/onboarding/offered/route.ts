import { createClientForRequest, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /bff/onboarding/offered
// Records, once, that the onboarding setup was shown to the owner. It is the evidence that the
// choice was offered, which is what allows the pipeline to settle the industry as `other` if the
// owner never answers. Repeated calls keep the first time.
export async function POST(request: Request) {
  try {
    // Queries run as the caller: the desktop app sends only a Bearer token, never cookies.
    const supabase = await createClientForRequest(request);

    const { data: { user }, error: authError } = await getUserFromRequest(request, supabase);
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

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

    const { error: updateError } = await supabase
      .from("accounts")
      .update({ onboarding_offered_at: new Date().toISOString() })
      .eq("id", member.account_id)
      .is("onboarding_completed_at", null)
      .is("onboarding_offered_at", null);
    if (updateError) {
      return NextResponse.json({ error: "Failed to record the offer" }, { status: 500 });
    }

    return NextResponse.json({ success: true, account_id: member.account_id });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
