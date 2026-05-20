import { createClient, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /bff/account/current
// Returns the active account for the authenticated user.
// Used by /wizard/complete to pre-fill the organisation name input.
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await getUserFromRequest(request, supabase);
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: member, error } = await supabase
      .from("account_members")
      .select("role, account_id, accounts(id, name, slug, seat_limit, plan_id, plans(code, name, seat_limit_default))")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 });
    }

    if (!member?.accounts) {
      return NextResponse.json({ error: "No active account" }, { status: 404 });
    }

    const account = Array.isArray(member.accounts) ? member.accounts[0] : member.accounts;
    const plan = Array.isArray(account.plans) ? account.plans[0] : account.plans;

    return NextResponse.json({
      id:         account.id,
      name:       account.name,
      slug:       account.slug,
      plan:       plan ? { code: plan.code, name: plan.name } : null,
      seat_limit: account.seat_limit ?? plan?.seat_limit_default ?? null,
      my_role:    member.role,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
