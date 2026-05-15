'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KairoLogo } from '@/components/kairo-logo';
import { AlertCircle } from 'lucide-react';

type ErrorType = 'duplicate_email' | 'oauth_error' | 'session_error' | string;

const ERROR_CONTENT: Record<string, { title: string; body: string; cta?: string; ctaHref?: string }> = {
  duplicate_email: {
    title: 'Account already exists',
    body:  'An account with this email address already exists and uses a password to sign in. ' +
           'Please sign in with your password. Once logged in, you can add Google as a ' +
           'sign-in method from your account settings.',
    cta:     'Sign in with password',
    ctaHref: '/login',
  },
  session_error: {
    title: 'Sign-in failed',
    body:  'We couldn\'t complete the sign-in process. This can happen if the link expired or was already used. Please try again.',
    cta:     'Try again',
    ctaHref: '/wizard',
  },
  oauth_error: {
    title: 'Sign-in error',
    body:  'Something went wrong during Google sign-in. Please try again.',
    cta:     'Try again',
    ctaHref: '/wizard',
  },
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const type = (searchParams.get('type') ?? 'oauth_error') as ErrorType;
  const description = searchParams.get('description');

  const content = ERROR_CONTENT[type] ?? ERROR_CONTENT.oauth_error;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f9fafb',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: 'white',
        borderRadius: 12,
        padding: '40px 36px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{ marginBottom: 24 }}>
          <KairoLogo size={26} href="/" />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <AlertCircle size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#111827' }}>
            {content.title}
          </h1>
        </div>

        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: '0 0 24px' }}>
          {content.body}
        </p>

        {/* Show raw description only for generic errors in non-production */}
        {description && type === 'oauth_error' && (
          <p style={{
            fontSize: 12, color: '#9ca3af', fontFamily: 'monospace',
            background: '#f3f4f6', borderRadius: 6, padding: '8px 12px',
            marginBottom: 20, wordBreak: 'break-word',
          }}>
            {decodeURIComponent(description)}
          </p>
        )}

        {content.cta && content.ctaHref && (
          <Link
            href={content.ctaHref}
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '10px 0',
              borderRadius: 8,
              background: '#111827',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {content.cta}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading…</p>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
