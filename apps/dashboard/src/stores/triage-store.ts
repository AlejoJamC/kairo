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
  /** KAI-168 — count of this client's tickets whose operational SLA (by ticket priority) was breached. */
  slaBreachedCount: number;

  // KAI-227 — origin of this profile. When the ticket has no `client_id`,
  // the API falls back to `draft_contact` matched by email and returns
  // source='draft' with the draft id + status so the UI can render a
  // badge and (in KAI-228) hook up confirm/reject/edit actions.
  source?:          "client" | "draft";
  draftId?:         string;
  draftStatus?:     "proposed" | "confirmed" | "rejected";
  organization?:    string | null;
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
  // Realtime UPDATE (any field, any status): merge if present, insert if the
  // ticket re-enters the active triage queue (e.g. awaiting_customer -> open).
  upsertTicket: (ticket: Ticket) => void;
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
      const sorted = sortTickets(deduped);
      return {
        tickets: sorted,
        // First arrival auto-selects; subsequent arrivals don't change selection
        selectedTicketId: state.selectedTicketId ?? ticket.id,
        classifiedCount: sorted.filter((t) => t.classified_at !== null).length,
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

  upsertTicket: (ticket) =>
    set((state) => {
      const exists = state.tickets.some((t) => t.id === ticket.id);
      const merged = exists
        ? state.tickets.map((t) => (t.id === ticket.id ? { ...t, ...ticket } : t))
        : [...state.tickets, ticket];
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
