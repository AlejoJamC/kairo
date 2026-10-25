import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizeResetEmail } from "@/lib/password-reset";

// POST /bff/auth/password-reset
//
// Answers whether the email belongs to an existing Kairo user. The link that
// sets the password is then sent by the browser client, so the session it
// creates lands in the same browser. Nothing is changed here.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const email = normalizeResetEmail((body as { email?: unknown } | null)?.email);

  if (!email) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ email });
}
