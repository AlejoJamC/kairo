// Command palette — tickets and views, opened with ⌘K or from the sidebar search.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { CommandPalette, type IconName, type PaletteSection } from "@kairo/ui";
import type { AppView } from "@/types";

interface CommandPaletteHostProps {
  open: boolean;
  onClose: () => void;
  onViewChange: (view: AppView) => void;
}

export function CommandPaletteHost({ open, onClose, onViewChange }: CommandPaletteHostProps) {
  const { t } = useTranslation(["dashboard"]);
  const tickets = useTriageStore((state) => state.tickets);
  const selectTicket = useTriageStore((state) => state.selectTicket);
  const hasSelection = useTriageStore((state) => state.selectedTicketId !== null);
  const [query, setQuery] = useState("");

  const sections = useMemo<PaletteSection[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = tickets
      .filter((ticket) => !needle
        || (ticket.subject ?? "").toLowerCase().includes(needle)
        || String(ticket.ticket_number ?? "").includes(needle)
        || (ticket.from_name ?? "").toLowerCase().includes(needle)
        || (ticket.from_email ?? "").toLowerCase().includes(needle))
      .slice(0, 6)
      .map((ticket) => ({
        id: `ticket:${ticket.id}`,
        label: ticket.subject ?? "—",
        icon: "ticket" as IconName,
        meta: ticket.ticket_number ? `KAI-${ticket.ticket_number}` : undefined,
      }));
    const views: { view: AppView; icon: IconName; label: string }[] = [
      { view: "triage", icon: "triage", label: t("dashboard:sidebar.triage") },
      { view: "awaiting", icon: "awaiting", label: t("dashboard:sidebar.pendingClient") },
      { view: "resolved", icon: "resolved", label: t("dashboard:sidebar.resolved") },
      { view: "escalated", icon: "escalated", label: t("dashboard:sidebar.escalation") },
      { view: "ai-review", icon: "spark", label: t("dashboard:sidebar.aiReview") },
      { view: "knowledge", icon: "knowledge", label: t("dashboard:sidebar.knowledge") },
      { view: "clients", icon: "clients", label: t("dashboard:sidebar.clients") },
      { view: "settings", icon: "settings", label: t("dashboard:sidebar.settings") },
    ];
    const actions: { id: string; icon: IconName; label: string; shortcut: string }[] = hasSelection
      ? [
          { id: "action:acknowledge", icon: "check", label: t("dashboard:replyBar.actionReconocer"), shortcut: "A" },
          { id: "action:resolve", icon: "resolve", label: t("dashboard:replyBar.actionResolver"), shortcut: "R" },
          { id: "action:escalate", icon: "escalate", label: t("dashboard:replyBar.actionEscalar"), shortcut: "E" },
          { id: "action:note", icon: "lock", label: t("dashboard:replyBar.modeNote"), shortcut: "N" },
        ]
      : [];
    return [
      { id: "tickets", title: t("dashboard:topChrome.palette.ticketsSection"), items: matches },
      {
        id: "actions",
        title: t("dashboard:topChrome.palette.actionsSection"),
        items: actions.filter((entry) => !needle || entry.label.toLowerCase().includes(needle)).map((entry) => ({ id: entry.id, label: entry.label, icon: entry.icon, shortcut: [entry.shortcut] })),
      },
      {
        id: "goto",
        title: t("dashboard:topChrome.palette.goToSection"),
        items: views.filter((entry) => !needle || entry.label.toLowerCase().includes(needle)).map((entry) => ({ id: `view:${entry.view}`, label: entry.label, icon: entry.icon })),
      },
    ].filter((section) => section.items.length > 0);
  }, [tickets, hasSelection, query, t]);

  function close() {
    setQuery("");
    onClose();
  }

  function handleSelect(id: string) {
    close();
    if (id.startsWith("ticket:")) {
      onViewChange("triage");
      selectTicket(id.slice("ticket:".length));
    } else if (id.startsWith("action:")) {
      const { requestTicketAction, requestPanelTab, requestComposeNote } = useTriageStore.getState();
      const action = id.slice("action:".length);
      if (action === "acknowledge" || action === "resolve") requestTicketAction(action);
      else if (action === "escalate") requestPanelTab("escalate");
      else if (action === "note") requestComposeNote();
    } else if (id.startsWith("view:")) {
      onViewChange(id.slice("view:".length) as AppView);
    }
  }

  return (
    <CommandPalette
      open={open}
      onClose={close}
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      activeId={sections[0]?.items[0]?.id}
      onSelect={handleSelect}
      labels={{
        dialog: t("dashboard:topChrome.palette.searchTitle"),
        input: t("dashboard:topChrome.palette.searchLabel"),
        placeholder: t("dashboard:topChrome.searchPlaceholder"),
        runFirst: t("dashboard:topChrome.palette.runFirst"),
        close: t("dashboard:topChrome.palette.close"),
      }}
    />
  );
}
