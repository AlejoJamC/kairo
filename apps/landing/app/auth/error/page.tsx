'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthPage } from '@/components/auth-page';
import { Box, Spinner, StatusPanel, Text } from "@kairo/ui";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = (searchParams.get('type') ?? 'oauth_error') as ErrorType;
  const description = searchParams.get('description');

  const content = ERROR_CONTENT[type] ?? ERROR_CONTENT.oauth_error!;
  const href = content.ctaHref ?? '/login';

  return (
    <AuthPage>
      <StatusPanel
          tone="error"
          title={content.title}
          description={content.body}
          action={{ label: content.cta ?? 'Back to sign in', onPress: () => router.push(href) }}
          secondary={{ label: 'Back to home', onPress: () => router.push('/') }}
          // Raw description only for generic errors.
          errorCode={description && type === 'oauth_error' ? decodeURIComponent(description) : type}
        />
    </AuthPage>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" backgroundColor="var(--kairo-color-sunk)">
        <Box display="flex" alignItems="center" gap={8}>
          <Spinner />
          <Text fontSize={14} color="var(--kairo-color-faint)">Loading…</Text>
        </Box>
      </Box>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
