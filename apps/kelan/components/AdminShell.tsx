'use client';

import type { ReactNode } from 'react';
import type { AdminUser } from '@kairo/types';
import { Avatar, Box, Button, Icon, Text } from '@kairo/ui';
import { signOut } from '@/lib/auth/actions';

interface AdminShellProps {
  admin: AdminUser;
  children: ReactNode;
}

export function AdminShell({ admin, children }: AdminShellProps) {
  return (
    <Box display="flex" minHeight="100vh" backgroundColor="var(--kairo-color-bg)">
      {/* Sidebar — placeholder for Phase 2 navigation */}
      <Box tag="aside" width={240} flexShrink={0} borderRightWidth={1} borderStyle="solid" borderRightColor="var(--kairo-color-line)" backgroundColor="var(--kairo-color-sunk)" display="flex" flexDirection="column">
        <Box padding={20} borderBottomWidth={1} borderStyle="solid" borderBottomColor="var(--kairo-color-line)" display="flex" alignItems="center" gap={8}>
          <Box width={28} height={28} borderRadius={8} backgroundColor="var(--kairo-color-accent)" display="flex" alignItems="center" justifyContent="center">
            <Icon name="zap" size={14} color="var(--kairo-color-on-accent)" />
          </Box>
          <Text fontSize={14} fontWeight={600} color="var(--kairo-color-text)">Kelan</Text>
        </Box>

        <Box tag="nav" flexGrow={1} flexShrink={1} flexBasis="0%" padding={12}>
          {/* Phase 2 navigation items go here */}
          <Text tag="p" display="block" margin={0} paddingVertical={8} paddingHorizontal={12} fontSize={12} fontWeight={500} textTransform="uppercase" letterSpacing={0.6} color="var(--kairo-color-faint)">
            Navigation — Phase 2
          </Text>
        </Box>

        {/* Admin identity + sign out */}
        <Box padding={16} borderTopWidth={1} borderStyle="solid" borderTopColor="var(--kairo-color-line)">
          <Box display="flex" alignItems="center" gap={12} marginBottom={12}>
            <Avatar name={admin.display_name} email={admin.email} seed={admin.email} size={32} />
            <Box minWidth={0}>
              <Text tag="p" display="block" margin={0} fontSize={14} fontWeight={500} color="var(--kairo-color-text)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {admin.display_name}
              </Text>
              <Text tag="p" display="block" margin={0} fontSize={12} color="var(--kairo-color-muted)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {admin.email}
              </Text>
            </Box>
          </Box>
          <form action={signOut}>
            <Button variant="ghost" full type="submit">
              Sign out
            </Button>
          </form>
        </Box>
      </Box>

      {/* Main content */}
      <Box tag="main" flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
        {children}
      </Box>
    </Box>
  );
}
