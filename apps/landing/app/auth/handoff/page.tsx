'use client';

/**
 * /auth/handoff
 *
 * Thin session-bridge page. The server-side callback sets the session via
 * cookies (exchangeCodeForSession), but the dashboard SPA lives on a different
 * origin and reads its session from localStorage via hash tokens.
 *
 * This page reads the cookie-based session client-side and immediately
 * redirects to the dashboard with hash tokens — the same pattern used by
 * the login page and wizard/complete.
 *
 * Used by: /auth/callback (scenarios 1, 2, 3 — user already has an account).
 */

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import { KairoLogo } from '@/components/kairo-logo';
import { Box, Spinner, Text } from "@kairo/ui";

export default function AuthHandoffPage() {
  useEffect(() => {
    const go = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const dashboardUrl = getDashboardUrl();

      if (session?.access_token && session?.refresh_token) {
        const hash =
          `#access_token=${encodeURIComponent(session.access_token)}` +
          `&refresh_token=${encodeURIComponent(session.refresh_token)}`;
        window.location.href = `${dashboardUrl}${hash}`;
      } else {
        window.location.href = dashboardUrl;
      }
    };

    go();
  }, []);

  return (
    <Box minHeight="100vh" display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={16} backgroundColor="var(--kairo-color-sunk)">
      <KairoLogo size={26} />
      <Box display="flex" alignItems="center" gap={8}>
        <Spinner />
        <Text fontSize={14} color="var(--kairo-color-faint)">Signing you in…</Text>
      </Box>
    </Box>
  );
}
