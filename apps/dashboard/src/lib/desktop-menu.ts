// The native menu of the desktop app: the pieces around buildAppMenu that
// depend on the dashboard. Labels follow the app language; an item with no
// counterpart in the app is disabled instead of doing nothing.

import type { AppMenuGroup, AppMenuItem } from "@kairo/ui";

/** Items the operating system runs itself (Undo, Copy, Quit…): they need no handler in the app. */
export const SYSTEM_ITEMS: ReadonlySet<string> = new Set(["undo", "redo", "cut", "copy", "paste", "select-all", "minimize", "zoom", "quit"]);

function mapItems(items: AppMenuItem[], fn: (item: AppMenuItem) => AppMenuItem): AppMenuItem[] {
  return items.map((item) => {
    const mapped = fn(item);
    return mapped.kind === "submenu" ? { ...mapped, items: mapItems(mapped.items, fn) } : mapped;
  });
}

/** Replaces every group and item label with the translation of its id; the original label when there is none. */
export function localizeMenu(groups: AppMenuGroup[], translate: (id: string) => string | undefined): AppMenuGroup[] {
  return groups.map((group) => ({
    ...group,
    label: translate(group.id) ?? group.label,
    items: mapItems(group.items, (item) => (item.kind === "separator" ? item : { ...item, label: translate(item.id) ?? item.label })),
  }));
}

/** Disables the items that neither the system nor the app can run, so none is a dead click. */
export function disableUnhandled(groups: AppMenuGroup[], handled: ReadonlySet<string>): AppMenuGroup[] {
  return groups.map((group) => ({
    ...group,
    items: mapItems(group.items, (item) => {
      if (item.kind !== "item" || SYSTEM_ITEMS.has(item.id) || handled.has(item.id)) return item;
      return { ...item, disabled: true };
    }),
  }));
}
