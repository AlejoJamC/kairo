// Shortcuts — the keyboard shortcuts dialog (?) and the shortcuts of the ticket
// queue: J K move through it, A acknowledges, R resolves, E escalates, N opens
// an internal note. They are ignored while the agent types in a field.

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { ShortcutsDialog, type ShortcutGroup } from "@kairo/ui";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

interface ShortcutsHostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHost({ open, onOpenChange }: ShortcutsHostProps) {
  const { t } = useTranslation(["dashboard"]);
  const hasSelection = useTriageStore((state) => state.selectedTicketId !== null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const store = useTriageStore.getState();
      switch (event.key) {
        case "?":
          event.preventDefault();
          onOpenChange(true);
          break;
        case "j":
          store.selectRelativeTicket(1);
          break;
        case "k":
          store.selectRelativeTicket(-1);
          break;
        case "a":
          if (store.selectedTicketId) store.requestTicketAction("acknowledge");
          break;
        case "r":
          if (store.selectedTicketId) store.requestTicketAction("resolve");
          break;
        case "e":
          if (store.selectedTicketId) store.requestPanelTab("escalate");
          break;
        case "n":
          if (store.selectedTicketId) {
            event.preventDefault();
            store.requestComposeNote();
          }
          break;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  const groups: ShortcutGroup[] = [
    {
      id: "navigation",
      title: t("dashboard:shortcuts.groups.navigation"),
      rows: [
        { label: t("dashboard:shortcuts.rows.queue"), keys: ["J", "K"] },
        { label: t("dashboard:shortcuts.rows.commands"), keys: ["⌘", "K"] },
        { label: t("dashboard:shortcuts.rows.settings"), keys: ["⌘", ","] },
      ],
    },
    {
      id: "ticket",
      title: t("dashboard:shortcuts.groups.ticket"),
      ticketOnly: true,
      rows: [
        { label: t("dashboard:replyBar.actionReconocer"), keys: ["A"] },
        { label: t("dashboard:replyBar.actionResolver"), keys: ["R"] },
        { label: t("dashboard:replyBar.actionEscalar"), keys: ["E"] },
        { label: t("dashboard:replyBar.modeNote"), keys: ["N"] },
        { label: t("dashboard:shortcuts.rows.send"), keys: ["⌘", "↵"] },
        { label: t("dashboard:replyBar.sendAndResolve"), keys: ["⌘", "⇧", "↵"] },
      ],
    },
    {
      id: "general",
      title: t("dashboard:shortcuts.groups.general"),
      rows: [
        { label: t("dashboard:shortcuts.rows.shortcuts"), keys: ["?"] },
        { label: t("dashboard:shortcuts.rows.close"), keys: ["esc"] },
      ],
    },
  ];

  return (
    <ShortcutsDialog
      open={open}
      onClose={() => onOpenChange(false)}
      groups={groups}
      inTicket={hasSelection}
      labels={{
        title: t("dashboard:shortcuts.title"),
        footer: t("dashboard:shortcuts.footer"),
        ticketOnly: t("dashboard:shortcuts.ticketOnly"),
        escape: "esc",
      }}
    />
  );
}
