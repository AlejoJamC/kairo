-- Realtime was never enabled for public.tickets — only public.ticket_events
-- got ALTER PUBLICATION in 20260506102019_ticket_events_check_and_realtime.sql
-- (KAI-27). Without this, postgres_changes never fires for tickets, so the
-- dashboard's left panel (useRealtimeTickets) silently never receives
-- INSERT/UPDATE events and only reflects whatever was loaded on initial fetch.
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
