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
 * the login page and wizard/complete. The three steps of the wait screen are
 * the real stages of that hand-off.
 *
 * Used by: /auth/callback (scenarios 1, 2, 3 — user already has an account).
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import { useTranslation } from '@/lib/i18n';
import { DESKTOP_PARAM, PORT_PARAM, desktopTarget, isDesktopDestination, parsePort } from '@/lib/desktop-signin';
import { Box, Icon, ProgressSteps, Text, type ProgressStep } from "@kairo/ui";

type Stage = 'verify' | 'prepare' | 'open' | 'done' | 'failed';

export default function AuthHandoffPage() {
  return (
    <Suspense>
      <Handoff />
    </Suspense>
  );
}

function Handoff() {
  const { t } = useTranslation();
  const h = t.handoff;
  const search = useSearchParams();
  const desktop = isDesktopDestination(search.get(DESKTOP_PARAM));
  const port = parsePort(search.get(PORT_PARAM));
  const [stage, setStage] = useState<Stage>('verify');
  const [failedAt, setFailedAt] = useState<Stage>('verify');
  const [attempt, setAttempt] = useState(0);
  const target = useRef<string | null>(null);

  const go = useCallback(async () => {
    let current: Stage = 'verify';
    try {
      setStage('verify');
      const supabase = createClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.access_token || !session.refresh_token) throw new Error('Session unavailable');

      current = 'prepare';
      setStage('prepare');
      const dashboardUrl = getDashboardUrl();
      // The desktop app gets the session through its kairo:// link; the browser app through the URL hash.
      target.current =
        desktop
          ? desktopTarget(port, { access_token: session.access_token, refresh_token: session.refresh_token })
          : `${dashboardUrl}#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;

      current = 'open';
      setStage('open');
      window.location.href = target.current;
      // The page stays open after handing the session to the desktop app.
      if (desktop) setStage('done');
    } catch {
      setFailedAt(current);
      setStage('failed');
    }
  }, [desktop, port]);

  useEffect(() => {
    void go();
  }, [go, attempt]);

  const order: readonly Stage[] = ['verify', 'prepare', 'open'];
  const labels: Partial<Record<Stage, string>> = { verify: h.stepVerify, prepare: h.stepPrepare, open: desktop ? h.stepOpenDesktop : h.stepOpen };
  const failed = stage === 'failed';
  const steps: ProgressStep[] = order.map((id) => {
    const index = order.indexOf(id);
    const reached = stage === 'done' ? order.length : order.indexOf(failed ? failedAt : stage);
    const status = failed
      ? index < reached ? 'done' : index === reached ? 'failed' : 'pending'
      : index < reached ? 'done' : index === reached ? 'active' : 'pending';
    return { id, label: labels[id] ?? '', status };
  });

  return (
    <Box minHeight="100vh" display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={20} paddingHorizontal={16} backgroundColor="var(--kairo-color-side)">
      <ProgressSteps
        title={failed ? h.errorTitle : stage === 'done' ? h.desktopDoneTitle : h.title}
        subtitle={failed ? undefined : stage === 'done' ? h.desktopDoneSubtitle : h.subtitle}
        steps={steps}
        doneLabel={h.ready}
        retryLabel={h.retry}
        onRetry={() => setAttempt((value) => value + 1)}
        cta={stage === 'done' ? { label: h.ctaDesktop, onPress: () => { window.location.href = target.current ?? getDashboardUrl(); } } : undefined}
        fallback={failed || !target.current ? undefined : { label: desktop ? h.fallbackDesktop : h.fallbackLink, href: target.current }}
      />
      {failed && (
        <Text tag="a" href="/login" fontSize={13} color="var(--kairo-color-accent-ink)">
          {h.backToSignIn}
        </Text>
      )}
      <Box display="flex" gap={18} paddingTop={24}>
        <Box display="inline-flex" alignItems="center" gap={6}>
          <Icon name="lock" size={10} color="var(--kairo-color-faint)" />
          <Text font="mono" fontSize={11} color="var(--kairo-color-faint)">
            {h.secure}
          </Text>
        </Box>
        <Text font="mono" fontSize={11} color="var(--kairo-color-faint)">
          © 2026 Kairo
        </Text>
      </Box>
    </Box>
  );
}
