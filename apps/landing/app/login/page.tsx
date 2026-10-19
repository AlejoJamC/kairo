'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import { useTranslation } from '@/lib/i18n';
import { AuthPage } from '@/components/auth-page';
import { AppLink } from '@/components/app-link';
import { AuthCard, Box, Field, FieldInput, GoogleMark } from '@kairo/ui';

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
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
    <AuthPage>
      <AuthCard
        title={t.login.title}
        subtitle={t.login.subtitle}
        providers={[{ id: 'google', label: t.login.googleButton, icon: <GoogleMark />, onPress: () => router.push('/wizard') }]}
        dividerLabel={t.login.emailDivider}
        aside={
          <Box alignItems="flex-end">
            <AppLink href="/set-password" fontSize={12} color="var(--kairo-color-accent)" font="mono">
              {t.login.forgotPassword}
            </AppLink>
          </Box>
        }
        error={error ?? undefined}
        submitLabel={t.login.signIn}
        loading={loading}
        loadingLabel={t.login.signingIn}
        submitDisabled={!email || !password}
        onSubmit={handleSubmit}
        footer={
          <>
            {t.login.noAccount}{' '}
            <AppLink href="/wizard" color="var(--kairo-color-accent)">
              {t.login.signUp}
            </AppLink>
          </>
        }
      >
        <Field label={t.login.emailLabel} size="web">
          <FieldInput value={email} onChangeText={setEmail} placeholder={t.login.emailPlaceholder} autoComplete="email" inputMode="email" readOnly={loading} />
        </Field>
        <Field label={t.login.passwordLabel} size="web">
          <FieldInput secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" autoComplete="current-password" readOnly={loading} />
        </Field>
      </AuthCard>
    </AuthPage>
  );
}
