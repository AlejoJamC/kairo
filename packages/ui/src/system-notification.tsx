// Native OS notification the desktop app sends for the two events that need
// the agent outside the window: a mention in an internal note and an SLA state
// change. The system draws it; this module builds the text and applies the
// sending rules.

export type SystemNotificationEvent =
  | { kind: 'mention'; from: string; ticketId: string; excerpt: string }
  | { kind: 'sla-at-risk'; ticketId: string; minutesLeft: number; subject: string; client: string }
  | { kind: 'sla-escalating'; ticketId: string; minutesLeft: number; subject: string; client: string }
  | { kind: 'sla-overdue'; ticketId: string; subject: string; client: string }

export interface SystemNotification {
  title: string
  body: string
  actions: { id: 'open' | 'mark-read'; label: string }[]
  /** A newer notification of the same ticket replaces the previous one. */
  dedupKey: string
}

/** The host that shows a system notification (Tauri in the desktop shell). */
export interface SystemNotificationHost {
  send(notification: SystemNotification): void
}

export interface SystemNotificationRules {
  /** account-menu presence: with Away or Invisible nothing is sent. */
  presence: 'online' | 'away' | 'invisible'
  /** The OS Do Not Disturb state, when the host reports it. */
  doNotDisturb: boolean
  /** True while the Kairo window is active. */
  windowActive: boolean
  /** The ticket currently open, or null. */
  openTicketId: string | null
  /** The OS has Kairo notifications turned off. */
  notificationsDisabled: boolean
}

/** Clamps an excerpt to at most two lines, as the mention body requires. */
export function clampExcerpt(text: string, maxLines = 2): string {
  return text.split(/\r?\n/).slice(0, maxLines).join('\n')
}

export function buildSystemNotification(event: SystemNotificationEvent): SystemNotification {
  switch (event.kind) {
    case 'mention':
      return {
        title: `${event.from} mentioned you in ${event.ticketId}`,
        body: clampExcerpt(event.excerpt),
        actions: [
          { id: 'open', label: 'Open ticket' },
          { id: 'mark-read', label: 'Mark read' },
        ],
        dedupKey: `${event.ticketId}:mention:${event.from}`,
      }
    case 'sla-at-risk':
      return {
        title: `SLA at risk on ${event.ticketId} · ${event.minutesLeft}m left`,
        body: `${event.subject} · ${event.client}`,
        actions: [{ id: 'open', label: 'Open ticket' }],
        dedupKey: `${event.ticketId}:sla-at-risk`,
      }
    case 'sla-escalating':
      return {
        title: `SLA almost breached on ${event.ticketId} · escalates in ${event.minutesLeft}m`,
        body: `${event.subject} · ${event.client}`,
        actions: [{ id: 'open', label: 'Open ticket' }],
        dedupKey: `${event.ticketId}:sla-escalating`,
      }
    case 'sla-overdue':
      return {
        title: `First response overdue on ${event.ticketId}`,
        body: `${event.subject} · ${event.client}`,
        actions: [{ id: 'open', label: 'Open ticket' }],
        dedupKey: `${event.ticketId}:sla-overdue`,
      }
  }
}

/** The sending rules from the spec: respects DnD and presence, is not sent
 * when the window is active and that ticket is open, and never when the OS has
 * notifications off. */
export function shouldSendSystemNotification(event: SystemNotificationEvent, rules: SystemNotificationRules): boolean {
  if (rules.notificationsDisabled) return false
  if (rules.doNotDisturb) return false
  if (rules.presence !== 'online') return false
  if (rules.windowActive && rules.openTicketId === event.ticketId) return false
  return true
}

/** Sends once per dedup key: a newer notification of the same ticket replaces
 * the previous one (the host keeps the last key per key). */
export function sendSystemNotification(
  host: SystemNotificationHost | null,
  event: SystemNotificationEvent,
  rules: SystemNotificationRules,
  seen: ReadonlySet<string> | null,
): SystemNotification | null {
  if (!shouldSendSystemNotification(event, rules)) return null
  const notification = buildSystemNotification(event)
  if (seen?.has(notification.dedupKey)) return null
  host?.send(notification)
  return notification
}
