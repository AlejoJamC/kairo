// Account menu — the profile box at the bottom of the sidebar and its popover.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { Avatar, Box, Icon, Kbd, Menu, MenuItem, Popover, PopoverContent, PopoverTrigger, Pressable, Segmented, Text } from "@kairo/ui";
import type { AppView } from "@/types";

type UserStatus = "online" | "busy" | "away" | "offline";
type Theme = "light" | "dark";

// Dots are semantic colors — not translated
const STATUS_DOTS: Record<UserStatus, string> = {
  online:  "var(--kairo-color-ok)",
  busy:    "var(--kairo-color-bad)",
  away:    "var(--kairo-color-warn)",
  offline: "var(--kairo-color-faint)",
};

const PRESENCE: Record<UserStatus, "online" | "away" | "invisible"> = {
  online: "online",
  busy: "away",
  away: "away",
  offline: "invisible",
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text tag="div" paddingHorizontal={8} paddingBottom={6} fontSize={10} font="mono" color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.5} display="block">
      {children}
    </Text>
  );
}

interface AccountMenuProps {
  collapsed: boolean;
  onViewChange: (view: AppView) => void;
}

export function AccountMenu({ collapsed, onViewChange }: AccountMenuProps) {
  const { t } = useTranslation(["dashboard"]);
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<UserStatus>("online");
  const [theme, setTheme] = useState<Theme>("light");

  // ⌘, opens Settings from anywhere, as the menu advertises.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        onViewChange("settings");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onViewChange]);

  if (!profile) return null;

  const displayName = profile.name ?? profile.email ?? "";
  const email = profile.email ?? "";

  const statusOptions: { id: UserStatus; label: string }[] = [
    { id: "online",  label: t("dashboard:topChrome.account.statusOnline") },
    { id: "busy",    label: t("dashboard:topChrome.account.statusBusy") },
    { id: "away",    label: t("dashboard:topChrome.account.statusAway") },
    { id: "offline", label: t("dashboard:topChrome.account.statusOffline") },
  ];
  const statusLabel = statusOptions.find((option) => option.id === status)?.label ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Pressable
          aria-label={t("dashboard:topChrome.palette.account")}
          display="flex"
          alignItems="center"
          justifyContent={collapsed ? "center" : "flex-start"}
          gap={8}
          width="100%"
          height={40}
          paddingHorizontal={collapsed ? 0 : 8}
          borderRadius={7}
          borderWidth={1}
          borderStyle="solid"
          borderColor="var(--k-border)"
          backgroundColor="var(--kairo-color-bg)"
          boxShadow="var(--k-shadow-card)"
        >
          <Avatar name={displayName} email={email} size={24} presence={PRESENCE[status]} />
          {!collapsed && (
            <>
              <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12.5} fontWeight={500} color="var(--k-text-primary)" textAlign="left" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {displayName}
              </Text>
              <Icon name="up" size={12} color="var(--kairo-color-faint)" />
            </>
          )}
        </Pressable>
      </PopoverTrigger>
      <PopoverContent label={t("dashboard:topChrome.palette.account")} side="top" align="start">
        <Box width={270} overflow="hidden" borderRadius={11}>
          <Box display="flex" alignItems="center" gap={10} paddingVertical={12} paddingHorizontal={14} borderBottomWidth={1} borderBottomColor="var(--k-border-subtle)" borderStyle="solid">
            <Avatar name={displayName} email={email} size={32} />
            <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
              <Text tag="div" fontSize={13} fontWeight={600} color="var(--k-text-primary)" display="block" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{displayName}</Text>
              <Text tag="div" fontSize={12} color="var(--k-text-tertiary)" display="block">{statusLabel}</Text>
            </Box>
          </Box>

          <Box paddingVertical={8} paddingHorizontal={6} borderBottomWidth={1} borderBottomColor="var(--k-border-subtle)" borderStyle="solid">
            <SectionLabel>{t("dashboard:topChrome.account.statusSection")}</SectionLabel>
            <Menu label={t("dashboard:topChrome.account.statusSection")}>
              {statusOptions.map((option) => (
                <MenuItem
                  key={option.id}
                  label={option.label}
                  current={status === option.id}
                  icon={<Box width={8} height={8} circle backgroundColor={STATUS_DOTS[option.id]} />}
                  onSelect={() => setStatus(option.id)}
                />
              ))}
            </Menu>
          </Box>

          <Box paddingVertical={10} paddingHorizontal={12} borderBottomWidth={1} borderBottomColor="var(--k-border-subtle)" borderStyle="solid">
            <Text tag="div" paddingBottom={8} fontSize={10} font="mono" color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.5} display="block">
              {t("dashboard:topChrome.account.appearanceSection")}
            </Text>
            <Segmented
              label={t("dashboard:topChrome.account.appearanceSection")}
              value={theme}
              onChange={setTheme}
              items={[
                { value: "light" as Theme, label: t("dashboard:topChrome.account.themeLight") },
                { value: "dark" as Theme, label: t("dashboard:topChrome.account.themeDark") },
              ]}
            />
          </Box>

          <Menu label={t("dashboard:topChrome.account.title", "Account")}>
            <MenuItem
              label={t("dashboard:topChrome.account.menuSettings")}
              shortcut={<Kbd>⌘,</Kbd>}
              onSelect={() => { setOpen(false); onViewChange("settings"); }}
            />
            <MenuItem
              destructive
              label={t("dashboard:topChrome.account.signOut")}
              onSelect={() => { setOpen(false); void signOut(); }}
            />
          </Menu>
        </Box>
      </PopoverContent>
    </Popover>
  );
}
