// Commands that reach UI owned by another component: the native menu, the
// shortcuts and the command palette open the palette, toggle the sidebar and
// the ticket list through here. The account presence lives here too, because
// the system notifications respect it.

import { create } from "zustand";
import { getPlatform } from "@kairo/client-core/config";
import type { AccountPresence } from "@kairo/ui";

export type PaletteScope = "all" | "commands";

const TICKET_LIST_KEY = "ticket-list-hidden";

function readTicketListHidden(): boolean {
  try {
    return getPlatform().storage.getItem(TICKET_LIST_KEY) === "true";
  } catch {
    return false;
  }
}

interface AppCommands {
  /** Counts up on every request; the owner opens its UI when the number changes. */
  paletteRequests: number;
  /** Scope the palette opens in: ⌘K opens All, ? opens Commands. */
  paletteScope: PaletteScope;
  sidebarToggleRequests: number;
  /** The ticket list of the queue views is hidden whole (⌘⇧F). */
  ticketListHidden: boolean;
  /** The open ticket has a similar ticket that is not grouped yet (and the list is shown). */
  similarGroupAvailable: boolean;
  setSimilarGroupAvailable: (available: boolean) => void;
  /** Tab of the context panel that is open (for the native menu check). */
  contextTab: string | null;
  setContextTab: (tab: string | null) => void;
  presence: AccountPresence;
  requestPalette: (scope?: PaletteScope) => void;
  requestSidebarToggle: () => void;
  setTicketListHidden: (hidden: boolean) => void;
  toggleTicketList: () => void;
  setPresence: (presence: AccountPresence) => void;
}

export const useAppCommands = create<AppCommands>((set, get) => ({
  paletteRequests: 0,
  paletteScope: "all",
  sidebarToggleRequests: 0,
  ticketListHidden: readTicketListHidden(),
  similarGroupAvailable: false,
  setSimilarGroupAvailable: (similarGroupAvailable) => set({ similarGroupAvailable }),
  contextTab: null,
  setContextTab: (contextTab) => set({ contextTab }),
  presence: "online",
  requestPalette: (scope = "all") => set((state) => ({ paletteRequests: state.paletteRequests + 1, paletteScope: scope })),
  requestSidebarToggle: () => set((state) => ({ sidebarToggleRequests: state.sidebarToggleRequests + 1 })),
  setTicketListHidden: (hidden) => {
    try {
      getPlatform().storage.setItem(TICKET_LIST_KEY, String(hidden));
    } catch {
      // The choice still applies for this session.
    }
    set({ ticketListHidden: hidden });
  },
  toggleTicketList: () => get().setTicketListHidden(!get().ticketListHidden),
  setPresence: (presence) => set({ presence }),
}));
