'use client';

import { AuthLayout, Box, Card, CardContent, KairoMark, Text } from '@kairo/ui';
import { AccessDenied } from '@/components/AccessDenied';
import { LoginButton } from '@/components/LoginButton';

export function LoginScreen({ accessDenied }: { accessDenied: boolean }) {
  return (
    <AuthLayout>
      <Box alignItems="center" marginBottom={24}>
        <Box display="flex" alignItems="center" justifyContent="center" marginBottom={16} aria-hidden>
          <KairoMark size={48} />
        </Box>
        <Text tag="h1" display="block" margin={0} fontSize={24} fontWeight={600} color="var(--kairo-color-text)">
          Kelan
        </Text>
        <Text tag="p" display="block" margin={0} marginTop={4} fontSize={14} color="var(--kairo-color-muted)">
          Kairo Platform Administration
        </Text>
      </Box>
      {accessDenied ? (
        <AccessDenied />
      ) : (
        <Card>
          <CardContent>
            <LoginButton />
          </CardContent>
        </Card>
      )}
    </AuthLayout>
  );
}
