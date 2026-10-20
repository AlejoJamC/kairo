// Account menu — the profile box at the bottom of the sidebar, its popover and
// the shortcuts that belong to it (⌘, opens Settings, ? opens the shortcuts).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@kairo/client-core/auth";
import { AccountMenu as AccountMenuPiece, type AccountPresence, type AccountTheme } from "@kairo/ui";
import type { AppView } from "@/types";

interface AccountMenuProps {
  collapsed: boolean;
  onViewChange: (view: AppView) => void;
  onOpenShortcuts: () => void;
}

export function AccountMenu({ collapsed, onViewChange, onOpenShortcuts }: AccountMenuProps) {
  const { t } = useTranslation(["dashboard"]);
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [presence, setPresence] = useState<AccountPresence>("online");
  const [theme, setTheme] = useState<AccountTheme>("light");

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

  return (
    <AccountMenuPiece
      name={profile.company_name ?? profile.name ?? profile.email}
      email={profile.email}
      presence={presence}
      onPresenceChange={setPresence}
      theme={theme}
      onThemeChange={setTheme}
      onOpenSettings={() => { setOpen(false); onViewChange("settings"); }}
      onOpenShortcuts={() => { setOpen(false); onOpenShortcuts(); }}
      onSignOut={() => { setOpen(false); void signOut(); }}
      collapsed={collapsed}
      open={open}
      onOpenChange={setOpen}
      labels={{
        account: t("dashboard:topChrome.account.title"),
        presenceTitle: t("dashboard:topChrome.account.statusSection"),
        presence: {
          online: t("dashboard:topChrome.account.statusOnline"),
          away: t("dashboard:topChrome.account.statusAway"),
          invisible: t("dashboard:topChrome.account.statusOffline"),
        },
        appearance: t("dashboard:topChrome.account.appearanceSection"),
        light: t("dashboard:topChrome.account.themeLight"),
        dark: t("dashboard:topChrome.account.themeDark"),
        settings: t("dashboard:topChrome.account.menuSettings"),
        shortcuts: t("dashboard:topChrome.account.menuShortcuts"),
        signOut: t("dashboard:topChrome.account.signOut"),
      }}
    />
  );
}
