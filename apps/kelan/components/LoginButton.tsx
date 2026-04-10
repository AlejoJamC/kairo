'use client';

import { useTransition } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function LoginButton() {
  const [isPending, startTransition] = useTransition();

  function handleSignIn() {
    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      // OAuth initiation must happen client-side so @supabase/ssr can store
      // the PKCE code_verifier in a cookie. If done server-side (server action),
      // the verifier is lost between requests and Supabase falls back to
      // implicit flow (hash-based tokens) which the callback cannot process.
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback/`,
          queryParams: { prompt: 'select_account' },
        },
      });
    });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-400 text-center">
        Sign in with your authorized Google account to access the admin panel.
      </p>
      <button
        onClick={handleSignIn}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-medium py-2.5 px-4 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        {isPending ? 'Redirecting…' : 'Sign in with Google'}
      </button>
    </div>
  );
}
