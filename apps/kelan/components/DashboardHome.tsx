'use client';

import { Box, Text } from '@kairo/ui';

export function DashboardHome() {
  return (
    <Box padding={32}>
      <Text tag="h1" display="block" margin={0} marginBottom={8} fontSize={24} fontWeight={600} color="var(--kairo-color-text)">
        Dashboard
      </Text>
      <Text tag="p" display="block" margin={0} color="var(--kairo-color-muted)">
        Kelan dashboard — Phase 2 coming soon.
      </Text>
    </Box>
  );
}
