'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import { useTranslation } from '@/lib/i18n';
import { normalizeResetEmail } from '@/lib/password-reset';
import { AuthPage } from '@/components/auth-page';
import { AppLink } from '@/components/app-link';
import { AuthCard, Box, Button, Field, FieldInput, PasswordStrength, Spinner, StatusPanel } from '@kairo/ui';

type Step = 'checking' | 'request' | 'sent' | 'password';

export default function SetPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<Step>('checking');

  // A session (Google sign-in, or the link sent by email) goes straight to the
  // password form; without one only an existing account's email moves on.
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setStep(session ? 'password' : 'request');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setStep('password');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (step === 'checking') {
    return (
      <AuthPage>
        <Box alignItems="center" paddingVertical={40}>
          <Spinner size="lg" />
        </Box>
      </AuthPage>
    );
  }

  if (step === 'sent') {
    return (
      <AuthPage>
        <StatusPanel
          title={t.setPassword.sentTitle}
          description={t.setPassword.sentSubtitle}
          icon="mail"
          action={{ label: t.setPassword.backToLogin, onPress: () => router.push('/login') }}
        />
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      {step === 'request' ? <RequestLink onSent={() => setStep('sent')} /> : <NewPassword />}
    </AuthPage>
  );
}

function RequestLink({ onSent }: { onSent: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeResetEmail(email);

  const handleSubmit = async () => {
    if (!normalized) {
      setError(t.setPassword.errorInvalidEmail);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const lookup = await fetch('/bff/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      });

      if (lookup.status === 404) {
        setError(t.setPassword.errorNotFound);
        setLoading(false);
        return;
      }
      if (!lookup.ok) {
        setError(t.setPassword.errorSend);
        setLoading(false);
        return;
      }

      // Sent from the browser so the session the link creates lands in this same browser.
      const { error: sendError } = await createClient().auth.resetPasswordForEmail(normalized, {
        redirectTo: `${window.location.origin}/set-password/`,
      });

      if (sendError) {
        setError(t.setPassword.errorSend);
        setLoading(false);
        return;
      }

      onSent();
    } catch {
      setError(t.setPassword.errorSend);
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={t.setPassword.requestTitle}
      subtitle={t.setPassword.requestSubtitle}
      error={error ?? undefined}
      submitLabel={t.setPassword.sendLink}
      loading={loading}
      loadingLabel={t.setPassword.sending}
      submitDisabled={!normalized}
      onSubmit={handleSubmit}
      footer={
        <AppLink href="/login" color="var(--kairo-color-accent)">
          {t.setPassword.backToLogin}
        </AppLink>
      }
    >
      <Field label={t.setPassword.emailLabel} size="web">
        <FieldInput value={email} onChangeText={setEmail} placeholder={t.setPassword.emailPlaceholder} autoComplete="email" inputMode="email" readOnly={loading} />
      </Field>
    </AuthCard>
  );
}

function NewPassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const isValid = hasMinLength && hasUppercase && hasNumber && passwordsMatch;
  const score = ([hasMinLength, hasUppercase, hasNumber, passwordsMatch].filter(Boolean).length) as 0 | 1 | 2 | 3 | 4;

  const handleSubmit = async () => {
    if (!isValid) {
      setError(t.setPassword.errorRequirements);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      // Same hash-token redirect as /wizard/complete so the dashboard's
      // supabase-js client (localStorage) can pick up the session.
      const { data: { session } } = await supabase.auth.getSession();
      const dashboardUrl = getDashboardUrl();
      if (session?.access_token && session?.refresh_token) {
        const hash = `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
        window.location.href = `${dashboardUrl}${hash}`;
      } else {
        window.location.href = dashboardUrl;
      }
    } catch {
      setError(t.setPassword.errorFailed);
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={t.setPassword.title}
      subtitle={t.setPassword.subtitle}
      error={error ?? undefined}
      submitLabel={t.setPassword.submit}
      loading={loading}
      loadingLabel={t.setPassword.submitting}
      submitDisabled={!isValid}
      onSubmit={handleSubmit}
      footer={
        <Button variant="ghost" onPress={() => router.push('/dashboard')}>
          {t.setPassword.skip}
        </Button>
      }
    >
      <Field label={t.setPassword.newPasswordLabel} size="web">
        <FieldInput secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" autoComplete="new-password" readOnly={loading} />
      </Field>
      <Field label={t.setPassword.confirmPasswordLabel} size="web">
        <FieldInput secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" autoComplete="new-password" readOnly={loading} />
      </Field>
      <PasswordStrength
        score={score}
        scoreLabel={t.setPassword.strength[score]!}
        requirements={[
          { met: hasMinLength, label: t.setPassword.reqMinLength },
          { met: hasUppercase, label: t.setPassword.reqUppercase },
          { met: hasNumber, label: t.setPassword.reqNumber },
          { met: passwordsMatch, label: t.setPassword.reqMatch, failed: confirmPassword.length > 0 && !passwordsMatch },
        ]}
      />
    </AuthCard>
  );
}
