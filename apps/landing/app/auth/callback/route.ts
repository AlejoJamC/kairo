import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;

      if (providerToken && data.user) {
        await supabase.from("gmail_accounts").upsert({
          user_id: data.user.id,
          email: data.user.email!,
          access_token: providerToken,
          refresh_token: providerRefreshToken,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        });

        await supabase
          .from("profiles")
          .update({ gmail_connected: true })
          .eq("id", data.user.id);
      }
    }
  }

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/wizard/complete`
  );
}
