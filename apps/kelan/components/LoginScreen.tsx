'use client';

import { AuthLayout, Box, Card, CardContent, Icon, Text } from '@kairo/ui';
import { AccessDenied } from '@/components/AccessDenied';
import { LoginButton } from '@/components/LoginButton';

export function LoginScreen({ accessDenied }: { accessDenied: boolean }) {
  return (
    <AuthLayout>
      <Box alignItems="center" marginBottom={24}>
        <Box display="flex" alignItems="center" justifyContent="center" width={56} height={56} borderRadius={16} backgroundColor="var(--kairo-color-accent)" marginBottom={16}>
          <Icon name="zap" size={26} color="var(--kairo-color-on-accent)" />
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
