// Keyboard shortcuts of the app. Single keys (J K A R E N and ?) are ignored
// while the agent types in a field. Key combinations are handled here only on
// the web: in the desktop app the native menu owns them and reports the pick.

import { useEffect } from "react";
import { isDesktop } from "@kairo/client-core/config";
import type { CommandId } from "@/lib/commands";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const SINGLE_KEYS: Record<string, CommandId> = {
  "?": "all-commands",
  j: "next-ticket",
  k: "previous-ticket",
  a: "acknowledge",
  r: "resolve",
  e: "escalate",
  n: "note",
};

const CONTEXT_KEYS: Record<string, CommandId> = {
  "1": "context-client",
  "2": "context-assistant",
  "3": "context-notes",
  "4": "context-escalate",
};

function combinationOf(event: KeyboardEvent): CommandId | null {
  const key = event.key.toLowerCase();
  if (event.ctrlKey && event.metaKey && !event.shiftKey && key === "s") return "toggle-sidebar";
  const primary = event.metaKey || event.ctrlKey;
  if (!primary || event.altKey) return null;
  if (event.shiftKey) {
    if (key === "f") return "toggle-ticket-list";
    if (key === "l") return "switch-theme";
    return null;
  }
  if (key === "k") return "search";
  if (key === "j") return "ask-assistant";
  if (key === ",") return "go-settings";
  return CONTEXT_KEYS[key] ?? null;
}

export function useAppShortcuts(run: (id: CommandId) => void) {
  useEffect(() => {
    const desktop = isDesktop();
    function onKeyDown(event: KeyboardEvent) {
      const combination = combinationOf(event);
      if (combination) {
        if (desktop) return;
        event.preventDefault();
        run(combination);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const single = SINGLE_KEYS[event.key];
      if (!single) return;
      if (single === "all-commands" || single === "note") event.preventDefault();
      run(single);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [run]);
}
