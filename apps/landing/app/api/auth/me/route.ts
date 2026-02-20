import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { Database } from "@/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data } = await supabase
      .from("profiles")
      .select("name, company_name, account_type, gmail_connected")
      .eq("id", user.id)
      .single();

    const profile = data as Profile | null;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email!,
        name:
          profile?.name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          "User",
        company_name: profile?.company_name,
        accountType: profile?.account_type,
        gmailConnected: profile?.gmail_connected,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
