// UserMenu — compact profile row at sidebar bottom.
// Light-theme restyle (KAI-156); supports collapsed mode (icon only).

import { useAuth } from "@kairo/client-core/auth";
import { Avatar, Box, Icon, Pressable, Text } from "@kairo/ui";

interface UserMenuProps {
  collapsed?: boolean;
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const { profile, signOut } = useAuth();

  if (!profile) return null;

  const displayName = profile.name || profile.email;

  if (collapsed) {
    return (
      <Box title={displayName ?? ""} display="flex" justifyContent="center">
        <Avatar name={profile.name} email={profile.email} size={28} />
      </Box>
    );
  }

  return (
    <Box display="flex" alignItems="center" gap={8} paddingVertical={6} paddingHorizontal={4} borderRadius={6} backgroundColor="var(--k-bg)" borderWidth={1} borderColor="var(--k-border)" borderStyle="solid">
      <Avatar name={profile.name} email={profile.email} size={24} marginLeft={4} />

      {/* Name + status */}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
        <Text tag="p" fontSize={12} fontWeight={500} color="var(--k-text-primary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" margin={0} display="block">
          {displayName}
        </Text>
        {/* Gmail connected badge moved to Channels settings (KAI-173) */}
      </Box>

      {/* Sign out */}
      <Pressable onClick={signOut} title="Sign out" hoverStyle={{ color: "var(--k-text-primary)", backgroundColor: "var(--k-surface-2)" }} padding={4} color="var(--k-text-tertiary)" backgroundColor="transparent" borderWidth={0} cursor="pointer" borderRadius={4} display="flex" alignItems="center" marginRight={2}>
        <Icon name="logout" size={14} />
      </Pressable>
    </Box>
  );
}
