import { useEffect } from "react";
import { fetchInboxTickets } from "@kairo/client-core/queries";
import { useAuth } from "@kairo/client-core/auth";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { useRealtimeTickets } from "@kairo/client-core/hooks/use-realtime-tickets";
import { useNoteCounts } from "@kairo/client-core/hooks/use-note-counts";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { NOTE_COUNTS_POLL_INTERVAL_SECONDS } from "@/lib/poll-intervals";
import { getOperationalSlaConfig } from "@kairo/client-core/endpoints";
import { TicketList } from "./ticket-list";
import { TicketDetail } from "./ticket-detail";
import { AiAssistant } from "./ai-assistant";
import type { TicketPriority, PrioritySlaConfig } from "@kairo/types";
import { Box } from "@kairo/ui";

export function Inbox() {
  const { user, accountId } = useAuth();
  const { tickets, selectedTicketId, setTickets, setScanning, setOperationalSlaConfig } = useTriageStore();

  useRealtimeTickets();

  // KAI-232 — per-ticket note counters for the queue chip, the ticket header
  // and the Notes tab badge. Owned here, next to the ticket fetch.
  useNoteCounts(INTERNAL_NOTES_ENABLED && !!user, NOTE_COUNTS_POLL_INTERVAL_SECONDS);

  // KAI-168 — fetch the account's operational SLA config once per session.
  // Tickets themselves are fetched directly from Supabase below (not via the
  // API), so this is the only round-trip needed to compute operational_sla
  // client-side for every ticket, regardless of where its row came from.
  useEffect(() => {
    if (!user) return;
    getOperationalSlaConfig()
      .then((res) => res.json())
      .then((body: { config: (PrioritySlaConfig & { priority: TicketPriority })[] }) => {
        const byPriority = {} as Record<TicketPriority, PrioritySlaConfig>;
        for (const row of body.config) {
          const { priority, ...config } = row;
          byPriority[priority] = config;
        }
        setOperationalSlaConfig(byPriority);
      })
      .catch(() => {}); // keep defaults on failure
  }, [user]);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setScanning(true);
      const { data, error } = await fetchInboxTickets(accountId);

      if (error) {
        console.error("[inbox] Failed to fetch tickets:", error.message, error);
        setTickets([]);
      } else {
        setTickets(data ?? []);
      }
      setScanning(false);
    })();
  }, [user, accountId]);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  return (
    <>
      <Box width={360} display="flex" flexDirection="column" backgroundColor="white" flexShrink={0} borderRightWidth={1} borderRightColor="var(--k-border)" borderStyle="solid">
        <TicketList />
      </Box>
      <TicketDetail />
      <AiAssistant
        customer={selectedTicket?.from_name ?? selectedTicket?.from_email ?? "—"}
      />
    </>
  );
}
