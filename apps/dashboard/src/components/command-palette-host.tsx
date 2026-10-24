// Command palette — tickets, actions and views in the All scope (⌘K), and the
// complete list of commands with their keys in the Commands scope (?).

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { tokens } from "@kairo/tokens";
import { CommandPalette, PriorityGlyph, type IconName, type PaletteItem, type PaletteSection } from "@kairo/ui";
import { COMMAND_GROUPS, COMMANDS, type CommandId } from "@/lib/commands";
import type { PaletteScope } from "@/lib/app-commands";
import { useCommands } from "@/hooks/use-commands";
import type { AppView } from "@/types";

interface CommandPaletteHostProps {
  open: boolean;
  scope: PaletteScope;
  onScopeChange: (scope: PaletteScope) => void;
  onClose: () => void;
  view: AppView;
  onViewChange: (view: AppView) => void;
}

const ACTIONS: { id: CommandId; icon: IconName; color: string }[] = [
  { id: "acknowledge", icon: "check", color: tokens["accent.default"] },
  { id: "resolve", icon: "resolve", color: tokens["color.ok"] },
  { id: "escalate", icon: "escalate", color: tokens["color.mood"] },
  { id: "note", icon: "lock", color: tokens["notes.label"] },
];

const VIEWS: { id: CommandId; icon: IconName }[] = [
  { id: "go-triage", icon: "triage" },
  { id: "go-awaiting", icon: "awaiting" },
  { id: "go-resolved", icon: "resolved" },
  { id: "go-escalated", icon: "escalated" },
  { id: "go-ai-review", icon: "spark" },
  { id: "go-knowledge", icon: "knowledge" },
  { id: "go-clients", icon: "clients" },
  { id: "go-settings", icon: "settings" },
];

export function CommandPaletteHost({ open, scope, onScopeChange, onClose, view, onViewChange }: CommandPaletteHostProps) {
  const { t } = useTranslation(["dashboard"]);
  const tickets = useTriageStore((state) => state.tickets);
  const selectTicket = useTriageStore((state) => state.selectTicket);
  const { run, stateOf, otherLanguage } = useCommands(view, onViewChange);
  const [query, setQuery] = useState("");

  const label = (id: CommandId) => t(`dashboard:commands.items.${id}`, { language: otherLanguage.toUpperCase() });

  const sections = useMemo<PaletteSection[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (text: string) => !needle || text.toLowerCase().includes(needle);

    if (scope === "commands") {
      return COMMAND_GROUPS.map((group) => ({
        id: group,
        title: t(`dashboard:commands.groups.${group}`),
        dense: true,
        items: COMMANDS.filter((command) => command.group === group && matches(label(command.id))).map((command): PaletteItem => {
          const state = stateOf(command);
          return {
            id: `command:${command.id}`,
            label: label(command.id),
            shortcut: command.keys,
            disabled: state.disabled,
            note: state.needsTicket ? t("dashboard:commands.onlyInTicket") : undefined,
          };
        }),
      })).filter((section) => section.items.length > 0);
    }

    const ticketItems = tickets
      .filter((ticket) => matches(`${ticket.subject ?? ""} ${ticket.ticket_number ?? ""} ${ticket.from_name ?? ""} ${ticket.from_email ?? ""}`))
      .slice(0, 6)
      .map((ticket): PaletteItem => ({
        id: `ticket:${ticket.id}`,
        label: ticket.subject ?? "—",
        leading: ticket.priority ? <PriorityGlyph priority={ticket.priority} size={12} label={false} /> : undefined,
        icon: ticket.priority ? undefined : "ticket",
        code: ticket.ticket_number ? `KAI-${ticket.ticket_number}` : undefined,
        where: ticket.status ? t(`dashboard:ticketStatus.${ticket.status}`, { defaultValue: ticket.status }) : undefined,
      }));
    const actionItems = ACTIONS.filter((action) => matches(label(action.id)) && !stateOf(COMMANDS.find((c) => c.id === action.id)!).disabled).map((action): PaletteItem => ({
      id: `command:${action.id}`,
      label: label(action.id),
      icon: action.icon,
      iconColor: action.color,
      shortcut: COMMANDS.find((c) => c.id === action.id)?.keys,
    }));
    const viewItems = VIEWS.filter((entry) => matches(label(entry.id))).map((entry): PaletteItem => ({ id: `command:${entry.id}`, label: label(entry.id), icon: entry.icon }));

    return [
      { id: "tickets", title: t("dashboard:topChrome.palette.ticketsSection"), items: ticketItems },
      { id: "actions", title: t("dashboard:topChrome.palette.actionsSection"), items: actionItems },
      {
        id: "goto",
        title: t("dashboard:topChrome.palette.goToSection"),
        items: [...viewItems, { id: "scope:commands", label: t("dashboard:commands.seeAll"), shortcut: ["?"], quiet: true }],
      },
    ].filter((section) => section.items.length > 0);
    // `label` and `stateOf` change with the language, the open ticket and the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, query, scope, t, stateOf, otherLanguage]);

  function close() {
    setQuery("");
    onClose();
  }

  function handleSelect(id: string) {
    if (id === "scope:commands") {
      onScopeChange("commands");
      return;
    }
    close();
    if (id.startsWith("ticket:")) {
      onViewChange("triage");
      selectTicket(id.slice("ticket:".length));
    } else if (id.startsWith("command:")) {
      run(id.slice("command:".length) as CommandId);
    }
  }

  const total = COMMANDS.length;
  const firstRunnable = sections.flatMap((section) => section.items).find((item) => !item.disabled && !item.quiet);

  return (
    <CommandPalette
      open={open}
      onClose={close}
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      activeId={firstRunnable?.id}
      onSelect={handleSelect}
      scope={{
        label: t("dashboard:commands.scopeLabel"),
        value: scope,
        items: [
          { value: "all", label: t("dashboard:commands.scopeAll"), shortcut: "⌘K" },
          { value: "commands", label: t("dashboard:commands.scopeCommands"), shortcut: "?" },
        ],
        onChange: (value) => onScopeChange(value as PaletteScope),
        summary: scope === "commands" ? t("dashboard:commands.count", { count: total }) : undefined,
      }}
      emptyText={query.trim() && sections.length === 0 ? t("dashboard:commands.noMatch", { query: query.trim() }) : undefined}
      labels={{
        dialog: t("dashboard:topChrome.palette.searchTitle"),
        input: t("dashboard:topChrome.palette.searchLabel"),
        placeholder: t("dashboard:commands.placeholder"),
        runFirst: t("dashboard:topChrome.palette.runFirst"),
        close: t("dashboard:topChrome.palette.close"),
        switchScope: t("dashboard:commands.switchScope"),
        note: t("dashboard:commands.note"),
      }}
    />
  );
}
