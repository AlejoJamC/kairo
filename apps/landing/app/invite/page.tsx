'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import { useRouter } from 'next/navigation';
import { AuthPage } from '@/components/auth-page';
import { AuthCard, Avatar, Field, FieldInput, InvitationSummary, Spinner, StatusPanel, Text } from "@kairo/ui";

type InvitationDetails = {
  id: string;
  account_id: string;
  account_name: string;
  email: string;
  role: string;
  expires_at: string;
  email_exists: boolean;
};

type PageState =
  | { status: 'loading' }
  | { status: 'invalid'; message: string }
  | { status: 'ready'; invitation: InvitationDetails }
  | { status: 'submitting' }
  | { status: 'success'; account_id: string };

const ROLE_LABELS: Record<string, string> = {
  admin:      'Admin',
  supervisor: 'Supervisor',
  agent:      'Agent',
};

// useSearchParams() requires a Suspense boundary during static build (Next.js App Router).
function InvitePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid', message: 'No invitation token found in the URL.' });
      return;
    }

    fetch(`/bff/invitations/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setState({ status: 'invalid', message: data.error });
        } else {
          setState({ status: 'ready', invitation: data as InvitationDetails });
        }
      })
      .catch(() =>
        setState({ status: 'invalid', message: 'Could not load invitation details.' })
      );
  }, [token]);

  const handleAccept = async () => {
    if (state.status !== 'ready') return;

    setError(null);
    setState({ status: 'submitting' });

    const { invitation } = state as { invitation: InvitationDetails };
    const supabase = createClient();

    // Step 1: authenticate (sign in or sign up)
    let accessToken: string | null = null;

    if (invitation.email_exists) {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password,
      });
      if (signInErr) {
        setError(signInErr.message);
        setState({ status: 'ready', invitation });
        return;
      }
      accessToken = data.session?.access_token ?? null;
    } else {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: invitation.email,
        password,
      });
      if (signUpErr) {
        setError(signUpErr.message);
        setState({ status: 'ready', invitation });
        return;
      }
      accessToken = data.session?.access_token ?? null;
    }

    if (!accessToken) {
      setError('Authentication succeeded but no session was returned. Please try again.');
      setState({ status: 'ready', invitation });
      return;
    }

    // Step 2: accept the invitation via the BFF
    const res = await fetch(`/bff/invitations/${encodeURIComponent(token!)}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const result = await res.json();

    if (!res.ok) {
      setError(result.error ?? 'Failed to accept invitation.');
      setState({ status: 'ready', invitation });
      return;
    }

    setState({ status: 'success', account_id: result.account_id });

    // Redirect to dashboard — pass tokens via hash (same pattern as login page)
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const dashboardUrl = getDashboardUrl();

    if (session?.access_token && session?.refresh_token) {
      const hash = `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
      window.location.href = `${dashboardUrl}${hash}`;
    } else {
      window.location.href = dashboardUrl;
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <AuthPage>
        <Text tag="div" display="flex" alignItems="center" justifyContent="center" gap={8} paddingVertical={40} fontSize={14} color="var(--kairo-color-faint)">
          <Spinner /> Loading invitation…
        </Text>
      </AuthPage>
    );
  }

  // ── Invalid / expired ────────────────────────────────────────────────────
  if (state.status === 'invalid') {
    return (
      <AuthPage>
        <StatusPanel title="Invitation not found" description={state.message} icon="clock" action={{ label: 'Back to home', onPress: () => router.push('/') }} />
      </AuthPage>
    );
  }

  // ── Success (brief flash before redirect) ────────────────────────────────
  if (state.status === 'success') {
    return (
      <AuthPage>
        <StatusPanel title="Welcome aboard 🎉" description="Redirecting to your dashboard…" icon="check" action={{ label: 'Open dashboard', onPress: () => { window.location.href = getDashboardUrl(); } }} />
      </AuthPage>
    );
  }

  // ── Form (ready | submitting) ────────────────────────────────────────────
  const invitation = (state as { invitation: InvitationDetails }).invitation;
  const isSubmitting = state.status === 'submitting';
  const actionLabel = invitation.email_exists ? 'Sign in to accept' : 'Create account & accept';

  return (
    <AuthPage wide>
      <AuthCard
        title="You've been invited"
        subtitle={`Join ${invitation.account_name} as ${ROLE_LABELS[invitation.role] ?? invitation.role}.`}
        error={error ?? undefined}
        submitLabel={actionLabel}
        loading={isSubmitting}
        loadingLabel="Please wait…"
        submitDisabled={!password}
        onSubmit={handleAccept}
        footer={`Invitation expires ${new Date(invitation.expires_at).toLocaleDateString()}.`}
      >
        <InvitationSummary
          workspace={invitation.account_name}
          inviter={<Avatar name={invitation.account_name} seed={invitation.account_id} size={28} />}
          rows={[
            { label: 'Workspace', value: invitation.account_name },
            { label: 'Role', value: ROLE_LABELS[invitation.role] ?? invitation.role },
            { label: 'Expires', value: new Date(invitation.expires_at).toLocaleDateString() },
          ]}
        />
        {/* Email — read-only, pre-filled from invitation */}
        <Field label="Email" size="web">
          <FieldInput value={invitation.email} readOnly />
        </Field>
        <Field label={invitation.email_exists ? 'Password' : 'Choose a password'} hint={invitation.email_exists ? undefined : 'Minimum 8 characters'} size="web">
          <FieldInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Minimum 8 characters" readOnly={isSubmitting} autoComplete={invitation.email_exists ? 'current-password' : 'new-password'} />
        </Field>
      </AuthCard>
    </AuthPage>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <AuthPage>
        <Text tag="div" display="flex" alignItems="center" justifyContent="center" gap={8} paddingVertical={40} fontSize={14} color="var(--kairo-color-faint)">
          <Spinner /> Loading invitation…
        </Text>
      </AuthPage>
    }>
      <InvitePageInner />
    </Suspense>
  );
}
