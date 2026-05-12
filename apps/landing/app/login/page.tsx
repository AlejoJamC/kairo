'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import Link from 'next/link';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AuthShell } from '@/components/auth-shell';
import { AuthInput } from '@/components/auth-input';
import { GoogleButton } from '@/components/google-button';

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError(t.login.errorInvalidCredentials);
        } else {
          setError(signInError.message);
        }
        setLoading(false);
        return;
      }

      // Pass tokens via hash so the dashboard's supabase-js client (localStorage)
      // can call setSession() — same pattern as /wizard/complete.
      const { data: { session } } = await supabase.auth.getSession();
      const dashboardUrl = getDashboardUrl();
      if (session?.access_token && session?.refresh_token) {
        const hash = `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
        window.location.href = `${dashboardUrl}${hash}`;
      } else {
        window.location.href = dashboardUrl;
      }
    } catch {
      setError(t.login.errorUnexpected);
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t.login.title}
      subtitle={t.login.subtitle}
      switchHref="/wizard"
      switchLabel={t.login.switchLabel}
    >
      {/* Error banner */}
      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: '12px 14px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 'var(--radius-input)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <AlertCircle
            style={{ width: 15, height: 15, color: 'var(--danger)', marginTop: 1, flexShrink: 0 }}
          />
          <p style={{ fontSize: 13, color: '#B91C1C', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Google button first (matches prototype order) */}
      <GoogleButton label={t.login.googleButton} href="/wizard" />

      {/* Divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '20px 0',
          color: 'var(--text-tertiary)',
          fontSize: 12,
        }}
      >
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        {t.login.or}
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AuthInput
          id="email"
          label={t.login.emailLabel}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder={t.login.emailPlaceholder}
          autoComplete="email"
        />

        <AuthInput
          id="password"
          label={t.login.passwordLabel}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          autoComplete="current-password"
          labelRight={
            <Link
              href="/set-password"
              style={{
                fontSize: 11,
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t.login.forgotPassword}
            </Link>
          }
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '11px 13px',
            marginTop: 4,
            fontSize: 14,
            fontWeight: 500,
            background: loading ? 'var(--border)' : 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-input)',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.12s ease',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)';
          }}
          onMouseLeave={(e) => {
            if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)';
          }}
        >
          {loading && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
          {loading ? t.login.signingIn : t.login.signIn}
        </button>
      </form>
    </AuthShell>
  );
}
