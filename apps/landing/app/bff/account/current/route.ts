import { createClientForRequest, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /bff/account/current
// Returns the active account for the authenticated user.
// Used by /wizard/complete to pre-fill the organisation name input.
export async function GET(request: Request) {
  try {
    const supabase = await createClientForRequest(request);

    const { data: { user }, error: authError } = await getUserFromRequest(request, supabase);
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: member, error } = await supabase
      .from("account_members")
      .select("role, account_id, accounts(id, name, slug, seat_limit, plan_id, industry, business_context, onboarding_completed_at, plans(code, name, seat_limit_default))")
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
      industry:   account.industry,
      business_context: account.business_context,
      onboarding_completed_at: account.onboarding_completed_at,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Updates only the active account's optional business description.
export async function PATCH(request: Request) {
  try {
    const supabase = await createClientForRequest(request);
    const { data: { user }, error: authError } = await getUserFromRequest(request, supabase);
    if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("account_id" in body) || !("business_context" in body) ||
        typeof body.account_id !== "string" || typeof body.business_context !== "string" || body.business_context.length > 2500) {
      return NextResponse.json({ error: "Invalid account settings" }, { status: 400 });
    }

    const { data: member, error: memberError } = await supabase.from("account_members")
      .select("account_id, role").eq("user_id", user.id).eq("status", "active")
      .order("joined_at", { ascending: true }).limit(1).maybeSingle();
    if (memberError) return NextResponse.json({ error: "Failed to fetch account" }, { status: 500 });
    if (!member || member.account_id !== body.account_id || !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const businessContext = body.business_context.trim() || null;
    const { data: account, error } = await supabase.from("accounts").update({
      business_context: businessContext,
      business_context_source: businessContext ? "manual" : null,
      business_context_updated_at: new Date().toISOString(),
    }).eq("id", member.account_id).select("business_context").maybeSingle();
    if (error || !account) return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
    return NextResponse.json({ business_context: account.business_context });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
