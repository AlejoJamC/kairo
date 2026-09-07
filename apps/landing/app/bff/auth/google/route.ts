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
        // (ADR-023 §2 — gmail.modify rejected as over-broad).
        scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        queryParams: {
          // access_type: offline is what makes Google issue a refresh_token
          // on first consent — still needed. `prompt: "consent"` used to be
          // forced here too, on every login, not just first connect: Google
          // re-issued session.provider_token every single time, which is the
          // root cause tier1-fast-path's re-fire bug traced back to (see the
          // !existingMembership gate in auth/callback/route.ts — that fixed
          // the effect; this fixes the cause). Per Google's own OAuth2 docs:
          // without `prompt`, a user is prompted only the first time a scope
          // set is requested — incremental authorization already handles a
          // returning user who needs to grant a newly-added scope (like
          // gmail.send was, historically) without forcing this every time.
          access_type: "offline",
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
