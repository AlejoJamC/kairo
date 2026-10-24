// The ticket list of the queue views is shown or hidden whole (⌘⇧F). The queue
// header offers to hide it; the ticket bar offers to show it again.

import { useTranslation } from "react-i18next";
import { useAppCommands } from "@/lib/app-commands";

const KEYS = { shortcut: "⌘⇧F", keyshortcuts: "Meta+Shift+F", controls: "ticket-list" } as const;

export function useTicketListVisibility() {
  const { t } = useTranslation("dashboard");
  const hidden = useAppCommands((state) => state.ticketListHidden);
  const setHidden = useAppCommands((state) => state.setTicketListHidden);
  return {
    hidden,
    show: () => setHidden(false),
    hideList: { label: t("ticketList.hide"), ...KEYS, onHide: () => setHidden(true) },
    showList: { label: t("ticketList.show"), ...KEYS, onShow: () => setHidden(false) },
  };
}
