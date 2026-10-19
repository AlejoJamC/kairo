// Global search — the sidebar search entry and the command palette (⌘K).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { CommandPalette, Icon, IconButton, KbdGroup, Pressable, Text, type IconName, type PaletteSection } from "@kairo/ui";
import type { AppView } from "@/types";

interface GlobalSearchProps {
  collapsed: boolean;
  onViewChange: (view: AppView) => void;
}

export function GlobalSearch({ collapsed, onViewChange }: GlobalSearchProps) {
  const { t } = useTranslation(["dashboard"]);
  const tickets = useTriageStore((state) => state.tickets);
  const selectTicket = useTriageStore((state) => state.selectTicket);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");

  // ⌘K / Ctrl+K opens the palette from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
    return [
      { id: "tickets", title: t("dashboard:topChrome.palette.ticketsSection"), items: matches },
      {
        id: "goto",
        title: t("dashboard:topChrome.palette.goToSection"),
        items: views.filter((entry) => !needle || entry.label.toLowerCase().includes(needle)).map((entry) => ({ id: `view:${entry.view}`, label: entry.label, icon: entry.icon })),
      },
    ].filter((section) => section.items.length > 0);
  }, [tickets, query, t]);

  function handleSelect(id: string) {
    setPaletteOpen(false);
    setQuery("");
    if (id.startsWith("ticket:")) {
      onViewChange("triage");
      selectTicket(id.slice("ticket:".length));
    } else if (id.startsWith("view:")) {
      onViewChange(id.slice("view:".length) as AppView);
    }
  }

  return (
    <>
      {collapsed ? (
        <IconButton label={t("dashboard:topChrome.searchPlaceholder")} onPress={() => setPaletteOpen(true)}>
          <Icon name="search" size={14} color="var(--kairo-color-faint)" />
        </IconButton>
      ) : (
        <Pressable
          aria-label={t("dashboard:topChrome.searchPlaceholder")}
          onClick={() => setPaletteOpen(true)}
          display="flex"
          alignItems="center"
          gap={10}
          width="100%"
          height={30}
          paddingHorizontal={10}
          borderRadius={6}
          borderWidth={1}
          borderStyle="solid"
          borderColor="var(--k-border)"
          backgroundColor="var(--kairo-color-bg)"
          boxShadow="var(--k-shadow-card)"
        >
          <Icon name="search" size={14} color="var(--kairo-color-faint)" />
          <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12.5} color="var(--k-text-tertiary)" textAlign="left" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {t("dashboard:topChrome.searchPlaceholder")}
          </Text>
          <KbdGroup keys={["⌘", "K"]} />
        </Pressable>
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => { setPaletteOpen(false); setQuery(""); }}
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
    </>
  );
}
