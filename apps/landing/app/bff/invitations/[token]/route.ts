import { createClient, createClientForRequest } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ token: string }> };

// ---------------------------------------------------------------------------
// GET /bff/invitations/[token]
// Public — looks up an invitation by token using get_invitation_by_token()
// (SECURITY DEFINER function, safe to call with anon key).
// ---------------------------------------------------------------------------
export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = await params;

  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("get_invitation_by_token", { p_token: token });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const invitation = Array.isArray(data) ? data[0] : data;

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation not found or has expired." },
      { status: 404 }
    );
  }

  // Check if this email already has an auth.users account.
  // We query profiles (public schema) — no service role needed.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", invitation.email)
    .maybeSingle();

  return NextResponse.json({
    id:           invitation.id,
    account_id:   invitation.account_id,
    account_name: invitation.account_name,
    email:        invitation.email,
    role:         invitation.role,
    expires_at:   invitation.expires_at,
    email_exists: !!profile,
  });
}

// ---------------------------------------------------------------------------
// POST /bff/invitations/[token]/accept
// Requires a valid Bearer token (the invitee must be signed in).
// Flow:
//   1. Validate the invitation still exists and matches the signed-in user's email.
//   2. Insert into account_members (allowed by "Users can accept own invitation" RLS policy).
//   3. Delete the invitation (allowed by "Invited user can delete own invitation" RLS policy).
// ---------------------------------------------------------------------------
export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;

  // Supabase client scoped to the requesting user's JWT — RLS policies apply.
  const supabase = await createClientForRequest(request);

  // Verify the user is authenticated.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up the invitation (SECURITY DEFINER function — reads through RLS).
  const { data: rows, error: lookupError } = await supabase
    .rpc("get_invitation_by_token", { p_token: token });

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const invitation = Array.isArray(rows) ? rows[0] : rows;

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation not found or has expired." },
      { status: 404 }
    );
  }

  // Guard: signed-in user's email must match the invitation.
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address." },
      { status: 403 }
    );
  }

  // Insert membership — allowed by the "Users can accept own invitation" RLS policy.
  const { error: insertError } = await supabase
    .from("account_members")
    .insert({
      account_id: invitation.account_id,
      user_id:    user.id,
      role:       invitation.role,
      status:     "active",
      invited_at: new Date().toISOString(),
      joined_at:  new Date().toISOString(),
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to join account.", detail: insertError.message },
      { status: 500 }
    );
  }

  // Delete the invitation — allowed by "Invited user can delete own invitation" RLS policy.
  await supabase
    .from("account_invitations")
    .delete()
    .eq("id", invitation.id);
  // Deletion failure is non-fatal: the invitation will expire naturally.

  return NextResponse.json({
    success:    true,
    account_id: invitation.account_id,
    role:       invitation.role,
  });
}
