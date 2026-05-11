import { create } from "zustand";
import type { Ticket } from "@kairo/types";

const PRIORITY_RANK: Record<string, number> = { P1: 3, P2: 2, P3: 1 };

// priority_score DESC NULLS LAST → priority P1>P2>P3>null → received_at ASC NULLS LAST (FIFO)
function sortTickets(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => {
    const sa = a.priority_score ?? -Infinity;
    const sb = b.priority_score ?? -Infinity;
    if (sb !== sa) return sb - sa;
    const pa = PRIORITY_RANK[a.priority ?? ""] ?? 0;
    const pb = PRIORITY_RANK[b.priority ?? ""] ?? 0;
    if (pb !== pa) return pb - pa;
    const da = a.received_at ? new Date(a.received_at).getTime() : Infinity;
    const db = b.received_at ? new Date(b.received_at).getTime() : Infinity;
    return da - db;
  });
}

export type { Ticket };

export interface RecentTicket {
  id:            string;
  ticket_number: number;
  subject:       string | null;
  status:        string;
  created_at:    string;
  resolved_at:   string | null;
}

export interface ClientProfile {
  clientId:         string;
  name:             string | null;
  email:            string | null;
  phone:            string | null;
  clientType:       "enterprise" | "pro" | "starter" | "unknown";
  activePlan:       string | null;
  planScore:        number;
  clientSince:      string | null;
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
  correctedTicketIds: Set<string>;
  // Bulk-load on initial fetch
  setTickets: (tickets: Ticket[]) => void;
  // Realtime INSERT: insert at top, auto-select first arrival
  addTicket: (ticket: Ticket) => void;
  selectTicket: (id: string | null) => void;
  // Realtime UPDATE: merge classification fields into existing row
  updateClassification: (id: string, data: Partial<Ticket>) => void;
  // Human correction: update ticket fields + mark as corrected
  applyCorrection: (id: string, fields: Partial<Ticket>) => void;
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
  correctedTicketIds: new Set<string>(),

  setTickets: (tickets) =>
    set((state) => {
      const sorted = sortTickets(tickets);
      return {
        tickets: sorted,
        selectedTicketId: state.selectedTicketId ?? sorted[0]?.id ?? null,
        classifiedCount: sorted.filter((t) => t.classified_at !== null).length,
      };
    }),

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
      const merged = state.tickets.map((t) => (t.id === id ? { ...t, ...data } : t));
      const sorted = sortTickets(merged);
      return {
        tickets: sorted,
        classifiedCount: sorted.filter((t) => t.classified_at !== null).length,
      };
    }),

  applyCorrection: (id, fields) =>
    set((state) => ({
      tickets: state.tickets.map((t) => (t.id === id ? { ...t, ...fields } : t)),
      correctedTicketIds: new Set([...state.correctedTicketIds, id]),
    })),

  setScanning: (v) => set({ isScanning: v }),
  setSuggestedReply: (reply) => set({ aiSuggestedReply: reply }),
  clearSuggestedReply: () => set({ aiSuggestedReply: null }),
  setPendingEscalation: (ticketId) => set({ pendingEscalation: ticketId }),
  setClientProfile: (profile) => set({ clientProfile: profile }),
}));
