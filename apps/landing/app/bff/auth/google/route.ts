import { createBufferedRouteClient } from "../../../../lib/supabase/server";
import { NextResponse } from "next/server";
import { env } from "../../../../env";
import { DESKTOP_COOKIE, callbackPath, desktopCookieValue, parsePort } from "../../../../lib/desktop-signin";

export async function GET(request: Request) {
  // The desktop app starts the sign-in with ?desktop=1 so it ends in a kairo:// link.
  const requestUrl = new URL(request.url);
  const canonicalUrl = new URL(env.NEXT_PUBLIC_APP_URL);
  // request.url reports the dev server's bind hostname, so the browser's host is read from the header.
  if (request.headers.get("host") !== canonicalUrl.host) {
    canonicalUrl.pathname = requestUrl.pathname;
    canonicalUrl.search = requestUrl.search;
    return NextResponse.redirect(canonicalUrl);
  }
  const params = requestUrl.searchParams;
  const desktop = params.get("desktop") === "1";
  const port = parsePort(params.get("port"));
  try {
    const { client: supabase, attach } = createBufferedRouteClient(request);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // KAI-114: gmail.send is the minimum scope that unlocks outbound replies
        // (ADR-023 §2 — gmail.modify rejected as over-broad).
        scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}${callbackPath(desktop, port)}`,
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

    const response = NextResponse.redirect(data.url);
    const locale = params.get("locale");
    if (locale === "en" || locale === "es") {
      response.cookies.set("kairo-locale", locale, {
        path: "/", sameSite: "lax", maxAge: 31536000, secure: canonicalUrl.protocol === "https:",
      });
    }
    if (desktop) {
      // Remembered in the browser too, in case the redirect URL loses its query on the way back.
      response.cookies.set(DESKTOP_COOKIE, desktopCookieValue(port), { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
    }
    return attach(response);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
