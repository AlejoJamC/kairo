// Order of the tabs of the context panel, and the key each one answers to
// (⌘1 for the first, ⌘2 for the second, and so on).
// VITE_FF_RIGHT_PANEL_TAB_ORDER is a comma-separated list of tab ids; a tab not
// listed goes after the listed ones, in the default order. Unset uses the
// default order.

export const DEFAULT_TAB_ORDER = ["client", "assistant", "notes", "escalate", "similar", "articles"] as const;

export type ContextTabId = (typeof DEFAULT_TAB_ORDER)[number];

export function parseTabOrder(value: string | undefined): string[] {
  return (value ?? "").split(",").map((id) => id.trim()).filter(Boolean);
}

/** Every tab id, the listed ones first and the rest in the default order. */
export function orderedTabIds(order: readonly string[]): ContextTabId[] {
  const known = new Set<string>(DEFAULT_TAB_ORDER);
  const listed = order.filter((id, index): id is ContextTabId => known.has(id) && order.indexOf(id) === index);
  return [...listed, ...DEFAULT_TAB_ORDER.filter((id) => !listed.includes(id))];
}

/** Order of the six tabs in this build; the position gives each its ⌘ number. */
export const CONTEXT_TAB_ORDER: readonly ContextTabId[] = orderedTabIds(parseTabOrder(import.meta.env.VITE_FF_RIGHT_PANEL_TAB_ORDER));

/** Sorts the enabled tabs by the given order. */
export function sortTabs<T extends { id: string }>(tabs: T[], order: readonly string[]): T[] {
  const ranking: readonly string[] = orderedTabIds(order);
  return [...tabs].sort((a, b) => ranking.indexOf(a.id) - ranking.indexOf(b.id));
}
