-- Realtime sends the previous row with every UPDATE only when the table keeps its full row in the
-- replication stream. The sidebar compares the old and new status to refresh its totals only when
-- a ticket changes bucket.
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
