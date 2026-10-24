// Runs the commands of lib/commands.ts and tells which ones apply right now.
// The palette, the keyboard shortcuts and the native menu all go through it.

import { useCallback } from "react";
import { useAuth } from "@kairo/client-core/auth";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { isTicketReadOnly } from "@kairo/client-core/triage-status";
import { COMMANDS, CONTEXT_TABS, GO_VIEWS, PRIORITY_FILTERS, type CommandDef, type CommandId } from "@/lib/commands";
import { useAppCommands } from "@/lib/app-commands";
import { useLocale } from "@/hooks/useLocale";
import type { AppView } from "@/types";

export const QUEUE_VIEWS: readonly AppView[] = ["triage", "awaiting", "resolved", "escalated", "ai-review"];

/** Toggles that the native menu and the keyboard can both report for one key press. */
const DEBOUNCED: ReadonlySet<CommandId> = new Set(["toggle-sidebar", "toggle-ticket-list"]);
const DOUBLE_REPORT_MS = 250;
const lastRun: Partial<Record<CommandId, number>> = {};

/** Commands with no action wired in the app yet: they are listed but never runnable (the interface has no dark theme to switch to). */
const NOT_WIRED: ReadonlySet<CommandId> = new Set(["switch-theme"]);

export interface CommandState {
  disabled: boolean;
  /** The command needs an open ticket and there is none. */
  needsTicket: boolean;
}

export function useCommands(view: AppView, onViewChange: (view: AppView) => void) {
  const { signOut } = useAuth();
  const { language, setLanguage, supportedLanguages } = useLocale();
  const selectedTicketId = useTriageStore((state) => state.selectedTicketId);
  const status = useTriageStore((state) => state.tickets.find((ticket) => ticket.id === state.selectedTicketId)?.status ?? null);
  const classified = useTriageStore((state) => !!state.tickets.find((ticket) => ticket.id === state.selectedTicketId)?.classified_at);
  const similarGroupAvailable = useAppCommands((state) => state.similarGroupAvailable);

  const otherLanguage = supportedLanguages.find((lang: string) => lang !== language) ?? language;

  const stateOf = useCallback(
    (command: CommandDef): CommandState => {
      const needsTicket = !!command.ticket && !selectedTicketId;
      const final = !!command.editable && status !== null && isTicketReadOnly(status);
      const outsideQueue = (!!command.queue && !QUEUE_VIEWS.includes(view)) || (!!command.triage && view !== "triage");
      const notApplicable = (command.id === "wrong-classification" && !classified) || (command.id === "group-similar" && !similarGroupAvailable);
      return { needsTicket, disabled: NOT_WIRED.has(command.id) || needsTicket || final || outsideQueue || notApplicable };
    },
    [selectedTicketId, status, view, classified, similarGroupAvailable],
  );

  const run = useCallback(
    (id: CommandId) => {
      const command = COMMANDS.find((entry) => entry.id === id);
      if (!command || stateOf(command).disabled) return;
      if (DEBOUNCED.has(id)) {
        const now = Date.now();
        if (now - (lastRun[id] ?? 0) < DOUBLE_REPORT_MS) return;
        lastRun[id] = now;
      }
      const store = useTriageStore.getState();
      const app = useAppCommands.getState();
      if (id in GO_VIEWS) return onViewChange(GO_VIEWS[id as keyof typeof GO_VIEWS]);
      if (id in PRIORITY_FILTERS) return app.requestPriorityFilter(PRIORITY_FILTERS[id as keyof typeof PRIORITY_FILTERS]);
      if (id in CONTEXT_TABS) return store.requestPanelTab(CONTEXT_TABS[id]!);
      switch (id) {
        case "acknowledge":
        case "resolve":
          return store.requestTicketAction(id);
        case "escalate":
          return store.requestPanelTab("escalate");
        case "note":
          return store.requestComposeNote();
        case "send":
        case "send-resolve":
          return store.requestComposerSend(id);
        case "priority":
          return store.requestTicketMenu("priority");
        case "status":
          return store.requestTicketMenu("status");
        case "wrong-classification":
          return store.requestTicketMenu("reclassify");
        case "group-similar":
          return store.requestTicketMenu("group");
        case "ask-assistant":
          return store.requestPanelTab("assistant");
        case "next-ticket":
          return store.selectRelativeTicket(1);
        case "previous-ticket":
          return store.selectRelativeTicket(-1);
        case "search":
          return app.requestPalette("all");
        case "all-commands":
          return app.requestPalette("commands");
        case "toggle-sidebar":
          return app.requestSidebarToggle();
        case "toggle-ticket-list":
          return app.toggleTicketList();
        case "language":
          return setLanguage(otherLanguage);
        case "sign-out":
          return void signOut();
      }
    },
    [stateOf, onViewChange, setLanguage, otherLanguage, signOut],
  );

  return { run, stateOf, otherLanguage };
}
