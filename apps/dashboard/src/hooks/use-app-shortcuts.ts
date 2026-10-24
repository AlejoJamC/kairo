// Keyboard shortcuts of the app. Single keys (J K A R E N and ?) are ignored
// while the agent types in a field. Key combinations work on the web and in the
// desktop app, where the native menu also reports them: toggles ignore a repeat
// of the same command a moment later (see use-commands).

import { useEffect } from "react";
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
    if (key === "?" || key === "/") return "all-commands";
    if (key === "f") return "toggle-ticket-list";
    if (key === "l") return "switch-theme";
    return null;
  }
  if (key === "k") return "search";
  if (key === "/" || key === "?") return "all-commands";
  if (key === "j") return "ask-assistant";
  if (key === ",") return "go-settings";
  return CONTEXT_KEYS[key] ?? null;
}

const FILTER_KEYS: Record<string, CommandId> = {
  "0": "filter-all",
  "1": "filter-p1",
  "2": "filter-p2",
  "3": "filter-p3",
};
/** After P, the next key within this time picks the priority filter. */
const CHORD_MS = 1500;

export function useAppShortcuts(run: (id: CommandId) => void) {
  useEffect(() => {
    let chordStart = 0;
    function onKeyDown(event: KeyboardEvent) {
      const combination = combinationOf(event);
      if (combination) {
        event.preventDefault();
        run(combination);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (chordStart && Date.now() - chordStart < CHORD_MS) {
        chordStart = 0;
        const filter = FILTER_KEYS[event.key];
        if (filter) {
          event.preventDefault();
          run(filter);
          return;
        }
      }
      if (event.key === "p") {
        chordStart = Date.now();
        return;
      }
      const single = SINGLE_KEYS[event.key];
      if (!single) return;
      if (single === "all-commands" || single === "note") event.preventDefault();
      run(single);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [run]);
}
