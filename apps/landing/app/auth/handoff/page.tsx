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

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import { useTranslation } from '@/lib/i18n';
import { Box, ProgressSteps, Text, type ProgressStep } from "@kairo/ui";

type Stage = 'verify' | 'prepare' | 'open' | 'failed';

export default function AuthHandoffPage() {
  const { t } = useTranslation();
  const h = t.handoff;
  const [stage, setStage] = useState<Stage>('verify');
  const [failedAt, setFailedAt] = useState<Stage>('verify');
  const [attempt, setAttempt] = useState(0);
  const target = useRef<string | null>(null);

  const go = useCallback(async () => {
    let current: Stage = 'verify';
    try {
      setStage('verify');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      current = 'prepare';
      setStage('prepare');
      const dashboardUrl = getDashboardUrl();
      target.current =
        session?.access_token && session?.refresh_token
          ? `${dashboardUrl}#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`
          : dashboardUrl;

      current = 'open';
      setStage('open');
      window.location.href = target.current;
    } catch {
      setFailedAt(current);
      setStage('failed');
    }
  }, []);

  useEffect(() => {
    void go();
  }, [go, attempt]);

  const order: readonly Stage[] = ['verify', 'prepare', 'open'];
  const labels: Partial<Record<Stage, string>> = { verify: h.stepVerify, prepare: h.stepPrepare, open: h.stepOpen };
  const failed = stage === 'failed';
  const steps: ProgressStep[] = order.map((id) => {
    const index = order.indexOf(id);
    const reached = order.indexOf(failed ? failedAt : stage);
    const status = failed
      ? index < reached ? 'done' : index === reached ? 'failed' : 'pending'
      : index < reached ? 'done' : index === reached ? 'active' : 'pending';
    return { id, label: labels[id] ?? '', status };
  });

  return (
    <Box minHeight="100vh" display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={20} paddingHorizontal={16} backgroundColor="var(--kairo-color-sunk)">
      <ProgressSteps
        title={failed ? h.errorTitle : h.title}
        subtitle={failed ? undefined : h.subtitle}
        steps={steps}
        doneLabel={h.ready}
        retryLabel={h.retry}
        onRetry={() => setAttempt((value) => value + 1)}
      />
      {failed && (
        <Text tag="a" href="/login" fontSize={13} color="var(--kairo-color-accent-ink)">
          {h.backToSignIn}
        </Text>
      )}
    </Box>
  );
}
