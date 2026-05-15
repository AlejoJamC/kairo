'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import { KairoLogo } from '@/components/kairo-logo';

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

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
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

  // ── Shared layout wrapper ────────────────────────────────────────────────
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'white', borderRadius: 12, padding: '40px 36px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ marginBottom: 28 }}>
          <KairoLogo size={26} href="/" />
        </div>
        {children}
      </div>
    </div>
  );

  // ── Loading ──────────────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <Wrapper>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading invitation…</p>
      </Wrapper>
    );
  }

  // ── Invalid / expired ────────────────────────────────────────────────────
  if (state.status === 'invalid') {
    return (
      <Wrapper>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Invitation not found</h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>{state.message}</p>
      </Wrapper>
    );
  }

  // ── Success (brief flash before redirect) ────────────────────────────────
  if (state.status === 'success') {
    return (
      <Wrapper>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Welcome aboard 🎉</h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Redirecting to your dashboard…</p>
      </Wrapper>
    );
  }

  // ── Form (ready | submitting) ────────────────────────────────────────────
  const invitation = (state as { invitation: InvitationDetails }).invitation;
  const isSubmitting = state.status === 'submitting';
  const actionLabel = invitation.email_exists ? 'Sign in to accept' : 'Create account & accept';

  return (
    <Wrapper>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>You've been invited</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
        Join <strong>{invitation.account_name}</strong> as{' '}
        <strong>{ROLE_LABELS[invitation.role] ?? invitation.role}</strong>.
      </p>

      <form onSubmit={handleAccept} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Email — read-only, pre-filled from invitation */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>
            Email
          </label>
          <input
            type="email"
            value={invitation.email}
            readOnly
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
              fontSize: 14, background: '#f9fafb', color: '#6b7280', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Password */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>
            {invitation.email_exists ? 'Password' : 'Choose a password'}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Minimum 8 characters"
            disabled={isSubmitting}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 14, boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !password}
          style={{
            padding: '10px 0', borderRadius: 8, border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer',
            background: isSubmitting ? '#9ca3af' : '#111827', color: 'white',
            fontSize: 14, fontWeight: 600, marginTop: 4,
          }}
        >
          {isSubmitting ? 'Please wait…' : actionLabel}
        </button>
      </form>

      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 20, textAlign: 'center' }}>
        Invitation expires {new Date(invitation.expires_at).toLocaleDateString()}.
      </p>
    </Wrapper>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ width: '100%', maxWidth: 440, background: 'white', borderRadius: 12, padding: '40px 36px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading invitation…</p>
        </div>
      </div>
    }>
      <InvitePageInner />
    </Suspense>
  );
}
