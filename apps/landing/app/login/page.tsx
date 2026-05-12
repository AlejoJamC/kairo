'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import Link from 'next/link';
import { AlertCircle, Loader2, Mail, Lock } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { KairoLogo } from '@/components/kairo-logo';
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
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        background: 'white',
      }}
    >
      {/* ── Left: form ───────────────────────────── */}
      <div
        style={{
          padding: '32px 40px',
          display: 'flex',
          flexDirection: 'column',
          background: 'white',
        }}
      >
        <KairoLogo size={26} href="/" />

        {/* Centered content area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 380,
            margin: '0 auto',
          }}
        >
          <h1
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: '12px 0 8px',
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            {t.login.title}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              margin: '0 0 28px',
              lineHeight: 1.5,
            }}
          >
            {t.login.subtitle}
          </p>

          {/* Error banner */}
          {error && (
            <div
              style={{
                marginBottom: 20,
                padding: '10px 12px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 'var(--radius-input)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <AlertCircle
                style={{ width: 14, height: 14, color: 'var(--danger)', marginTop: 1, flexShrink: 0 }}
              />
              <p style={{ fontSize: 13, color: '#B91C1C', margin: 0, lineHeight: 1.4 }}>{error}</p>
            </div>
          )}

          {/* OAuth buttons */}
          <GoogleButton label={t.login.googleButton} href="/wizard" />

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              margin: '28px 0',
              color: 'var(--text-tertiary)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            {t.login.emailDivider}
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Email + password fields */}
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <AuthInput
              id="email"
              label={t.login.emailLabel}
              type="email"
              placeholder={t.login.emailPlaceholder}
              icon={<Mail size={14} color="var(--text-tertiary)" strokeWidth={1.6} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <AuthInput
              id="password"
              label={t.login.passwordLabel}
              type="password"
              placeholder="••••••••"
              icon={<Lock size={14} color="var(--text-tertiary)" strokeWidth={1.6} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {/* Forgot password link aligned right */}
            <div style={{ textAlign: 'right', marginTop: -4 }}>
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
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '12px',
                marginTop: 8,
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
                if (!loading) e.currentTarget.style.background = 'var(--accent-hover)';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.background = 'var(--accent)';
              }}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? t.login.signingIn : t.login.signIn}
            </button>
          </form>

          {/* Switch to sign up */}
          <div
            style={{
              marginTop: 18,
              fontSize: 13,
              color: 'var(--text-tertiary)',
              textAlign: 'center',
            }}
          >
            {t.login.noAccount}{' '}
            <Link
              href="/wizard"
              style={{ color: 'var(--accent)', cursor: 'pointer' }}
            >
              {t.login.signUp}
            </Link>
          </div>
        </div>

        {/* Bottom copyright */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {t.footer.copyright}
        </div>
      </div>

      {/* ── Right: testimonial panel ──────────────── */}
      <div
        style={{
          background: 'linear-gradient(160deg, #1E2A4A 0%, #0F1729 100%)',
          color: 'white',
          padding: '32px 40px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative dot grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            pointerEvents: 'none',
          }}
        />

        {/* Quote */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            position: 'relative',
            maxWidth: 460,
          }}
        >
          <p
            style={{
              fontSize: 26,
              lineHeight: 1.4,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              margin: '0 0 28px',
              fontFamily: 'var(--font-display)',
            }}
          >
            {t.login.testimonialQuote}
          </p>

          {/* Person */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'linear-gradient(135deg,#FCA5A5,#F472B6)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              VC
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {t.login.testimonialName}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {t.login.testimonialRole}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.05em',
          }}
        >
          <span>4.9 · G2 · 23 REVIEWS</span>
          <span>SOC 2 (EN PROCESO)</span>
        </div>
      </div>
    </div>
  );
}
