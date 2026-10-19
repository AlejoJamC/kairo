'use client';

import { useRouter } from 'next/navigation';
import { StatusPanel } from '@kairo/ui';
import { ROUTES } from '@/lib/constants';

export function AccessDenied() {
  const router = useRouter();

  return (
    <StatusPanel
      tone="error"
      title="Access denied"
      description="Your account does not have access to Kelan. Contact the platform administrator."
      action={{ label: 'Try a different account', onPress: () => router.push(ROUTES.LOGIN) }}
    />
  );
}
