// The Superpowers panel on the right is shown or hidden whole (⌘⇧B). The panel
// offers to hide itself; the ticket bar offers to show it again.

import { useTranslation } from "react-i18next";
import { useAppCommands } from "@/lib/app-commands";
import { SUPERPOWERS_ENABLED } from "@/lib/panel-flags";

const KEYS = { shortcut: "⌘⇧B", keyshortcuts: "Meta+Shift+B", controls: "superpowers" } as const;

export function useSuperpowersVisibility() {
  const { t } = useTranslation("dashboard");
  const hidden = useAppCommands((state) => state.superpowersHidden);
  const setHidden = useAppCommands((state) => state.setSuperpowersHidden);
  return {
    hidden: SUPERPOWERS_ENABLED && hidden,
    show: () => setHidden(false),
    hidePanel: { label: t("superpowers.hide"), ...KEYS, onHide: () => setHidden(true) },
    showPanel: { label: t("superpowers.show"), ...KEYS, onShow: () => setHidden(false) },
  };
}
