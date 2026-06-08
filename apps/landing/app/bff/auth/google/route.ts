import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { env } from "@/env";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // KAI-114: gmail.send is the minimum scope that unlocks outbound replies
        // (ADR-023 §2 — gmail.modify rejected as over-broad). Adding it forces
        // Google to re-prompt every existing user for consent (prompt: consent
        // below already requires the consent screen on every connect).
        scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
