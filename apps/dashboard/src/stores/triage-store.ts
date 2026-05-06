import { create } from "zustand";
import type { Ticket } from "@kairo/types";

export type { Ticket };

export interface RecentTicket {
  id:            string;
  ticket_number: number;
  subject:       string | null;
  status:        string;
  created_at:    string;
}

export interface ClientProfile {
  clientId:         string;
  name:             string | null;
  email:            string | null;
  phone:            string | null;
  clientType:       "enterprise" | "pro" | "starter" | "unknown";
  activePlan:       string | null;
  planScore:        number;
  isNewClient:      boolean;
  isRecurrent:      boolean;
  totalTickets:     number;
  ticketsLast30Days: number;
  recentTickets:    RecentTicket[];
}

interface TriageStore {
  tickets: Ticket[];
  selectedTicketId: string | null;
  aiSuggestedReply: string | null;
  isScanning: boolean;
  classifiedCount: number;
  pendingEscalation: string | null;
  clientProfile: ClientProfile | null;
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
  setClientProfile: (profile: ClientProfile | null) => void;
}

export const useTriageStore = create<TriageStore>((set) => ({
  tickets: [],
  selectedTicketId: null,
  aiSuggestedReply: null,
  isScanning: false,
  classifiedCount: 0,
  pendingEscalation: null,
  clientProfile: null,

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
  setClientProfile: (profile) => set({ clientProfile: profile }),
}));
