import { useState, useEffect } from "react";
import { apiCall } from "@/lib/api-client";

export type DeliveryStatus = "queued" | "sending" | "sent" | "failed";

export interface ThreadMessage {
  id: string;
  /** "internal" = agent-only note that never reaches the customer (KAI-221). */
  direction: "inbound" | "outbound" | "internal";
  sender_external_id: string | null;
  sender_display_name: string | null;
  body_plain: string | null;
  body_html: string | null;
  snippet: string | null;
  received_at: string;
  is_origin: boolean;
  delivery_status?: DeliveryStatus | null;
  send_error?: { code: string; message?: string } | null;
}

interface UseTicketThreadResult {
  messages: ThreadMessage[];
  loading: boolean;
  error: string | null;
  /**
   * Appends a message to the local thread immediately (KAI-114 outbox optimism).
   * Used right after POST /reply returns 202 — the worker will later land the
   * real delivery_status; we don't poll for it (per KAI-165, no realtime needed
   * — full live tracking is KAI-221's reply-bar redesign).
   */
  appendOptimisticMessage: (message: ThreadMessage) => void;
}

/**
 * Fetches the message thread for a ticket via GET /api/v1/tickets/:id/messages.
 * Refreshes whenever ticketId changes. No polling — no realtime needed per KAI-165.
 */
export function useTicketThread(ticketId: string | null): UseTicketThreadResult {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) {
      setMessages([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiCall(`/api/v1/tickets/${ticketId}/messages`)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new Error(`${res.status}: ${text}`);
        }
        return res.json() as Promise<{ messages: ThreadMessage[]; count: number }>;
      })
      .then((data) => {
        if (!cancelled) setMessages(data.messages ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  function appendOptimisticMessage(message: ThreadMessage) {
    setMessages((prev) => [...prev, message]);
  }

  return { messages, loading, error, appendOptimisticMessage };
}
