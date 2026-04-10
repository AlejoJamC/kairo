import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase/server';
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

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
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

    const adminClient = createServiceRoleClient();

    const { data: adminUser, error: adminError } = await adminClient
      .from('admin_users')
      .select('id')
      .eq('auth_uid', sessionData.user.id)
      .eq('is_active', true)
      .single();

    if (adminError || !adminUser) {
      // User authenticated with Google but is not in admin_users.
      // Sign them out so they don't have a dangling session.
      await supabase.auth.signOut();
      return NextResponse.redirect(deniedUrl);
    }

    // Update last_login_at
    await adminClient
      .from('admin_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', adminUser.id);

    return response;
  } catch {
    return NextResponse.redirect(deniedUrl);
  }
}
