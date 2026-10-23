// Commands that reach UI owned by another component: the native menu opens the
// command palette and the shortcuts dialog through here. The account presence
// lives here too, because the system notifications respect it.

import { create } from "zustand";
import type { AccountPresence } from "@kairo/ui";

interface AppCommands {
  /** Counts up on every request; the owner opens its UI when the number changes. */
  paletteRequests: number;
  shortcutsRequests: number;
  presence: AccountPresence;
  requestPalette: () => void;
  requestShortcuts: () => void;
  setPresence: (presence: AccountPresence) => void;
}

export const useAppCommands = create<AppCommands>((set) => ({
  paletteRequests: 0,
  shortcutsRequests: 0,
  presence: "online",
  requestPalette: () => set((state) => ({ paletteRequests: state.paletteRequests + 1 })),
  requestShortcuts: () => set((state) => ({ shortcutsRequests: state.shortcutsRequests + 1 })),
  setPresence: (presence) => set({ presence }),
}));
