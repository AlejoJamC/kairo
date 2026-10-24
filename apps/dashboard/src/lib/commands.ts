// The official set of commands of the app, with the keys each one shows. The
// command palette (Commands scope), the status bar, the native menu and the
// tabs take their keys from here.

export type CommandGroup = "ticket" | "goTo" | "view" | "general";

export type CommandId =
  | "acknowledge" | "resolve" | "escalate" | "note" | "send" | "send-resolve" | "ask-assistant"
  | "priority" | "status" | "wrong-classification" | "group-similar"
  | "next-ticket" | "previous-ticket" | "search"
  | "go-triage" | "go-awaiting" | "go-resolved" | "go-escalated" | "go-ai-review" | "go-knowledge" | "go-clients" | "go-settings"
  | "toggle-sidebar" | "toggle-ticket-list" | "context-client" | "context-assistant" | "context-notes" | "context-escalate" | "switch-theme" | "language"
  | "all-commands" | "close" | "sign-out";

export interface CommandDef {
  id: CommandId;
  group: CommandGroup;
  /** Key caps shown for the command, one entry per cap. */
  keys?: readonly string[];
  /** Needs an open ticket. */
  ticket?: boolean;
  /** Needs an editable (non-final) ticket. */
  editable?: boolean;
  /** Only in the queue views. */
  queue?: boolean;
}

export const COMMANDS: readonly CommandDef[] = [
  { id: "acknowledge", group: "ticket", keys: ["A"], ticket: true, editable: true },
  { id: "resolve", group: "ticket", keys: ["R"], ticket: true, editable: true },
  { id: "escalate", group: "ticket", keys: ["E"], ticket: true, editable: true },
  { id: "note", group: "ticket", keys: ["N"], ticket: true, editable: true },
  { id: "send", group: "ticket", keys: ["⌘", "↵"], ticket: true, editable: true },
  { id: "send-resolve", group: "ticket", keys: ["⌘", "⇧", "↵"], ticket: true, editable: true },
  { id: "ask-assistant", group: "ticket", keys: ["⌘", "J"], ticket: true },
  { id: "priority", group: "ticket", ticket: true, editable: true },
  { id: "status", group: "ticket", ticket: true, editable: true },
  { id: "wrong-classification", group: "ticket", ticket: true, editable: true },
  { id: "group-similar", group: "ticket", ticket: true, editable: true },
  { id: "next-ticket", group: "goTo", keys: ["J"], queue: true },
  { id: "previous-ticket", group: "goTo", keys: ["K"], queue: true },
  { id: "search", group: "goTo", keys: ["⌘", "K"] },
  { id: "go-triage", group: "goTo" },
  { id: "go-awaiting", group: "goTo" },
  { id: "go-resolved", group: "goTo" },
  { id: "go-escalated", group: "goTo" },
  { id: "go-ai-review", group: "goTo" },
  { id: "go-knowledge", group: "goTo" },
  { id: "go-clients", group: "goTo" },
  { id: "go-settings", group: "goTo", keys: ["⌘", ","] },
  { id: "toggle-sidebar", group: "view", keys: ["⌃", "⌘", "S"] },
  { id: "toggle-ticket-list", group: "view", keys: ["⌘", "⇧", "F"], queue: true },
  { id: "context-client", group: "view", keys: ["⌘", "1"], ticket: true },
  { id: "context-assistant", group: "view", keys: ["⌘", "2"], ticket: true },
  { id: "context-notes", group: "view", keys: ["⌘", "3"], ticket: true },
  { id: "context-escalate", group: "view", keys: ["⌘", "4"], ticket: true },
  { id: "switch-theme", group: "view", keys: ["⌘", "⇧", "L"] },
  { id: "language", group: "view" },
  { id: "all-commands", group: "general", keys: ["?"] },
  { id: "close", group: "general", keys: ["esc"] },
  { id: "sign-out", group: "general" },
];

export const COMMAND_GROUPS: readonly CommandGroup[] = ["ticket", "goTo", "view", "general"];

/** Tab of the context panel each ⌘1–⌘4 command opens. */
export const CONTEXT_TABS: Partial<Record<CommandId, string>> = {
  "context-client": "client",
  "context-assistant": "assistant",
  "context-notes": "notes",
  "context-escalate": "escalate",
};

/** Views the "go-*" commands open. */
export const GO_VIEWS = {
  "go-triage": "triage",
  "go-awaiting": "awaiting",
  "go-resolved": "resolved",
  "go-escalated": "escalated",
  "go-ai-review": "ai-review",
  "go-knowledge": "knowledge",
  "go-clients": "clients",
  "go-settings": "settings",
} as const;
