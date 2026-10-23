// The notifications the sidebar bell shows, polled once for everyone who needs
// them: the bell, the app icon counter and the system notifications.

import { getNotifications } from "@kairo/client-core/endpoints";
import { getNumericFlag } from "@/lib/feature-flags";

// KAI-232 — how often /api/v1/notifications is re-fetched, in seconds.
const POLL_INTERVAL_SECONDS = getNumericFlag(import.meta.env.VITE_FF_NOTIFICATIONS_POLL_INTERVAL_SECONDS, 30);

// KAI-168 — API notification row (apps/api/src/routes/v1/notifications.ts).
export interface ApiNotification {
  id: string;
  kind: string;
  ticket_id: string | null;
  /** KAI-232 — note-level deep-link (nullable; only mention rows carry it). */
  ticket_event_id: string | null;
  /** KAI-232 — ticket reference for the row's mono chip. */
  ticket_short_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

type Listener = (rows: ApiNotification[]) => void;

const listeners = new Set<Listener>();
let rows: ApiNotification[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function load(): void {
  getNotifications()
    .then((res) => res.json())
    .then((body: { data: ApiNotification[] }) => {
      rows = body.data;
      listeners.forEach((listener) => listener(rows));
    })
    .catch(() => {});
}

/** Calls the listener with the current rows now and after every poll. The first subscriber starts the polling; the last one stops it. */
export function subscribeNotifications(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    load();
    timer = setInterval(load, POLL_INTERVAL_SECONDS * 1000);
  } else {
    listener(rows);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}
