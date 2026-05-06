import { create } from "zustand";
import type { Ticket } from "@kairo/types";

export type { Ticket };

interface TriageStore {
  tickets: Ticket[];
  selectedTicketId: string | null;
  aiSuggestedReply: string | null;
  isScanning: boolean;
  classifiedCount: number;
  // Escalation — ticketId that was escalated, null if none pending
  pendingEscalation: string | null;
  // Bulk-load on initial fetch
  setTickets: (tickets: Ticket[]) => void;
  // Realtime INSERT: insert at top, auto-select first arrival
  addTicket: (ticket: Ticket) => void;
  selectTicket: (id: string | null) => void;
  // Realtime UPDATE: merge classification fields into existing row
  updateClassification: (id: string, data: Partial<Ticket>) => void;
  setScanning: (v: boolean) => void;
  setSuggestedReply: (reply: string | null) => void;
  clearSuggestedReply: () => void;
  setPendingEscalation: (ticketId: string | null) => void;
}

export const useTriageStore = create<TriageStore>((set) => ({
  tickets: [],
  selectedTicketId: null,
  aiSuggestedReply: null,
  isScanning: false,
  classifiedCount: 0,
  pendingEscalation: null,

  setTickets: (tickets) =>
    set((state) => ({
      tickets,
      selectedTicketId: state.selectedTicketId ?? tickets[0]?.id ?? null,
      classifiedCount: tickets.filter((t) => t.classified_at !== null).length,
    })),

  addTicket: (ticket) =>
    set((state) => {
      const deduped = [ticket, ...state.tickets.filter((t) => t.id !== ticket.id)];
      return {
        tickets: deduped,
        // First arrival auto-selects; subsequent arrivals don't change selection
        selectedTicketId: state.selectedTicketId ?? ticket.id,
      };
    }),

  selectTicket: (id) => set({ selectedTicketId: id }),

  updateClassification: (id, data) =>
    set((state) => {
      const updated = state.tickets.map((t) => (t.id === id ? { ...t, ...data } : t));
      return {
        tickets: updated,
        classifiedCount: updated.filter((t) => t.classified_at !== null).length,
      };
    }),

  setScanning: (v) => set({ isScanning: v }),
  setSuggestedReply: (reply) => set({ aiSuggestedReply: reply }),
  clearSuggestedReply: () => set({ aiSuggestedReply: null }),
  setPendingEscalation: (ticketId) => set({ pendingEscalation: ticketId }),
}));
