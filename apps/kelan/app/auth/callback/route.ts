import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ROUTES, ERROR_CODES, SEARCH_PARAMS } from '@/lib/constants';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  const deniedUrl = `${origin}${ROUTES.LOGIN}?${SEARCH_PARAMS.ERROR}=${ERROR_CODES.ACCESS_DENIED}`;

  if (!code) {
    return NextResponse.redirect(deniedUrl);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.redirect(deniedUrl);
  }

  const response = NextResponse.redirect(`${origin}${ROUTES.DASHBOARD}`);

  // Mutable store: starts with request cookies, then captures cookies set
  // by exchangeCodeForSession so auth.uid() is available for the admin check
  // within the same request without re-reading from request.cookies.
  const cookieStore = new Map(
    request.cookies.getAll().map(c => [c.name, c.value])
  );

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !sessionData.user) {
      return NextResponse.redirect(deniedUrl);
    }

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id')
      .eq('auth_uid', sessionData.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!adminUser) {
      return NextResponse.redirect(deniedUrl);
    }

    return response;
  } catch {
    return NextResponse.redirect(deniedUrl);
  }
}
