import { createClient, getUserFromRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// PATCH /bff/account/name
// Updates accounts.name for the user's active account.
// Restricted to owner and admin roles — agents and supervisors cannot rename.
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await getUserFromRequest(request, supabase);
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const name: string | undefined = body.name;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // Only owner/admin may rename the organisation
    const { data: member } = await supabase
      .from("account_members")
      .select("account_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "No active account where you are owner or admin" },
        { status: 403 }
      );
    }

    const { error: updateError } = await supabase
      .from("accounts")
      .update({ name: name.trim() })
      .eq("id", member.account_id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update account name" }, { status: 500 });
    }

    return NextResponse.json({ success: true, account_id: member.account_id });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
