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
   * Used right after POST /reply returns 202 with a `queued` message. While any
   * message is still queued/sending, the hook polls until the worker lands the
   * real delivery_status (sent/failed), so "Enviando…" resolves on its own.
   */
  appendOptimisticMessage: (message: ThreadMessage) => void;
}

/** Outbound message is still in flight — keep polling until it settles. */
function hasPendingDelivery(messages: ThreadMessage[]): boolean {
  return messages.some(
    (m) => m.delivery_status === "queued" || m.delivery_status === "sending",
  );
}

const POLL_INTERVAL_MS = 3000;

/**
 * Fetches the message thread for a ticket via GET /api/v1/tickets/:id/messages.
 * Refreshes whenever ticketId changes, and polls while an outbound message is
 * still queued/sending so its delivery status updates without a manual refresh.
 */
export function useTicketThread(ticketId: string | null): UseTicketThreadResult {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load (and reset) whenever the selected ticket changes.
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

  // Poll the thread while an outbound message is queued/sending. The effect
  // re-evaluates when `pending` flips false (worker finished) and tears down.
  const pending = hasPendingDelivery(messages);
  useEffect(() => {
    if (!ticketId || !pending) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await apiCall(`/api/v1/tickets/${ticketId}/messages`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ThreadMessage[] };
        if (!cancelled) setMessages(data.messages ?? []);
      } catch {
        // transient — keep polling
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ticketId, pending]);

  function appendOptimisticMessage(message: ThreadMessage) {
    setMessages((prev) => [...prev, message]);
  }

  return { messages, loading, error, appendOptimisticMessage };
}
