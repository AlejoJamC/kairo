'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDashboardUrl } from '@/lib/api-config';
import { AuthPage } from '@/components/auth-page';
import { AuthCard, Box, Button, Field, FieldInput, PasswordStrength, Spinner } from '@kairo/ui';

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const isValid = hasMinLength && hasUppercase && hasNumber && passwordsMatch;
  const score = ([hasMinLength, hasUppercase, hasNumber, passwordsMatch].filter(Boolean).length) as 0 | 1 | 2 | 3 | 4;
  const scoreLabels = ['—', 'Weak', 'Fair', 'Good', 'Strong'];

  useEffect(() => {
    const checkAuthStatus = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/login');
        return;
      }

      setCheckingAuth(false);
    };

    checkAuthStatus();
  }, [router]);

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Please meet all password requirements');
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
      setError('Failed to set password. Please try again.');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <AuthPage>
        <Box alignItems="center" paddingVertical={40}>
          <Spinner size="lg" />
        </Box>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <AuthCard
        title="Set a password"
        subtitle="Add a password to enable email/password login"
        error={error ?? undefined}
        submitLabel="Set password"
        loading={loading}
        loadingLabel="Setting password…"
        submitDisabled={!isValid}
        onSubmit={handleSubmit}
        footer={
          <Button variant="ghost" onPress={() => router.push('/dashboard')}>
            Skip for now
          </Button>
        }
      >
        <Field label="New Password" size="web">
          <FieldInput secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" autoComplete="new-password" readOnly={loading} />
        </Field>
        <Field label="Confirm Password" size="web">
          <FieldInput secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" autoComplete="new-password" readOnly={loading} />
        </Field>
        <PasswordStrength
          score={score}
          scoreLabel={scoreLabels[score]!}
          requirements={[
            { met: hasMinLength, label: 'At least 8 characters' },
            { met: hasUppercase, label: 'One uppercase letter' },
            { met: hasNumber, label: 'One number' },
            { met: passwordsMatch, label: 'Passwords match', failed: confirmPassword.length > 0 && !passwordsMatch },
          ]}
        />
      </AuthCard>
    </AuthPage>
  );
}
