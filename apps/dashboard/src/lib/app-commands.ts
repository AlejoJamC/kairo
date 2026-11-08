// Commands that reach UI owned by another component: the native menu, the
// shortcuts and the command palette open the palette, toggle the sidebar and
// the ticket list through here. The account presence lives here too, because
// the system notifications respect it.

import { create } from "zustand";
import { getPlatform } from "@kairo/client-core/config";
import type { AccountPresence } from "@kairo/ui";
import { WORK_QUEUE_ENABLED } from "@/lib/panel-flags";

export type PriorityFilterValue = "all" | "P1" | "P2" | "P3";

export type PaletteScope = "all" | "commands";

const TICKET_LIST_KEY = "ticket-list-hidden";
const SUPERPOWERS_KEY = "superpowers-hidden";

/** With the Work Queue flag off the list is always hidden. */
function readTicketListHidden(): boolean {
  if (!WORK_QUEUE_ENABLED) return true;
  try {
    return getPlatform().storage.getItem(TICKET_LIST_KEY) === "true";
  } catch {
    return false;
  }
}

function readSuperpowersHidden(): boolean {
  try {
    return getPlatform().storage.getItem(SUPERPOWERS_KEY) === "true";
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
  /** The Superpowers panel on the right is hidden whole (⌘⇧B). */
  superpowersHidden: boolean;
  /** The reply composer has no text: Send and Send and resolve do not apply. */
  composerEmpty: boolean;
  setComposerEmpty: (empty: boolean) => void;
  /** The engine is classifying or syncing the queue. */
  engineBusy: boolean;
  setEngineBusy: (busy: boolean) => void;
  /** Cmd+J: the Assistant tab opens and its input takes the focus. */
  assistantFocusPending: boolean;
  requestAssistantFocus: () => void;
  clearAssistantFocus: () => void;
  /** Priority filter of the Triage list asked for by the keys P then 0-3. */
  priorityFilterRequest: { value: PriorityFilterValue; nonce: number } | null;
  requestPriorityFilter: (value: PriorityFilterValue) => void;
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
  setSuperpowersHidden: (hidden: boolean) => void;
  toggleSuperpowers: () => void;
  setPresence: (presence: AccountPresence) => void;
}

export const useAppCommands = create<AppCommands>((set, get) => ({
  paletteRequests: 0,
  paletteScope: "all",
  sidebarToggleRequests: 0,
  ticketListHidden: readTicketListHidden(),
  superpowersHidden: readSuperpowersHidden(),
  composerEmpty: true,
  setComposerEmpty: (composerEmpty) => set({ composerEmpty }),
  engineBusy: false,
  setEngineBusy: (engineBusy) => set({ engineBusy }),
  assistantFocusPending: false,
  requestAssistantFocus: () => set({ assistantFocusPending: true }),
  clearAssistantFocus: () => set({ assistantFocusPending: false }),
  priorityFilterRequest: null,
  requestPriorityFilter: (value) => set((state) => ({ priorityFilterRequest: { value, nonce: (state.priorityFilterRequest?.nonce ?? 0) + 1 } })),
  similarGroupAvailable: false,
  setSimilarGroupAvailable: (similarGroupAvailable) => set({ similarGroupAvailable }),
  contextTab: null,
  setContextTab: (contextTab) => set({ contextTab }),
  presence: "online",
  requestPalette: (scope = "all") => set((state) => ({ paletteRequests: state.paletteRequests + 1, paletteScope: scope })),
  requestSidebarToggle: () => set((state) => ({ sidebarToggleRequests: state.sidebarToggleRequests + 1 })),
  setTicketListHidden: (hidden) => {
    if (!WORK_QUEUE_ENABLED) return;
    try {
      getPlatform().storage.setItem(TICKET_LIST_KEY, String(hidden));
    } catch {
      // The choice still applies for this session.
    }
    set({ ticketListHidden: hidden });
  },
  toggleTicketList: () => get().setTicketListHidden(!get().ticketListHidden),
  setSuperpowersHidden: (hidden) => {
    try {
      getPlatform().storage.setItem(SUPERPOWERS_KEY, String(hidden));
    } catch {
      // The choice still applies for this session.
    }
    set({ superpowersHidden: hidden });
  },
  toggleSuperpowers: () => get().setSuperpowersHidden(!get().superpowersHidden),
  setPresence: (presence) => set({ presence }),
}));
