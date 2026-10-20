'use client';

import { useTransition } from 'react';
import { Box, Button, GoogleMark, Text } from '@kairo/ui';
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
    <Box display="flex" flexDirection="column" gap={16}>
      <Text tag="p" display="block" margin={0} textAlign="center" fontSize={14} color="var(--kairo-color-muted)">
        Sign in with your authorized Google account to access the admin panel.
      </Text>
      <Button size="web" full loading={isPending} loadingLabel="Redirecting…" icon={<GoogleMark size={18} />} onPress={handleSignIn}>
        Sign in with Google
      </Button>
    </Box>
  );
}
