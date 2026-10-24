# system-notification

## Purpose

Native operating-system notification that the desktop app sends when something needs the agent outside the window.

## Variants

- The system draws it (app icon, title "Kairo", time); this spec defines when it is sent, what it says and its actions.
- Sent for two events only; every other activity event stays in the sidebar bell:
  - Mention: a teammate mentions you in an internal note. First line "[Name] mentioned you in [ID]"; body: the note excerpt, up to two lines, mentions as plain text ("@Name"); actions "Open ticket" (default, also on click) and "Mark read".
  - SLA at risk: the "SLA" chip of sla-indicator in its state + "SLA at risk on [ID] · 40m left"; body "[Subject] · [Client]"; click opens the ticket.
  - SLA escalating: the "SLA" chip of sla-indicator in its state + "SLA almost breached on [ID] · escalates in 12m"; body "[Subject] · [Client]"; click opens the ticket.
  - SLA overdue: the "SLA" chip of sla-indicator in the overdue state + "First response overdue on [ID]"; body "[Subject] · [Client]"; click opens the ticket.
- One notification per SLA state change (see sla-indicator), never repeated for the same state.
- Texts are those of notification-row and sla-indicator. Where the system only takes text, the chip becomes the word "SLA".
- Rules: respects the system Do Not Disturb and the presence of account-menu (with Away or Invisible nothing is sent); not sent when the window is active and that ticket is open; a newer notification of the same ticket replaces the previous one; opening a notification marks its bell entry as read and updates dock-badge.

## States

- **default**: Sent, in the system notification center.
- **hover**: Drawn by the system.
- **active**: "Open ticket" or a click brings the window to the front with the ticket selected in its queue; "Mark read" marks it without opening the window.
- **disabled**: If the system has Kairo notifications turned off, nothing is sent and the bell keeps working.
- **loading**: Not applicable.
- **error**: Not applicable: if the system rejects the notification, the bell keeps the entry.

## Accessibility

- It is the native notification: the system announces it to screen readers.
- The text never depends on color: it states the event and the ticket.

## Domain value

When a teammate mentions the agent in a note on an Acme ticket while the window is in the background, the agent opens the ticket straight from the notification.

## Platforms

- **web**: Not applicable: the browser uses the bell.
- **desktop**: macOS (Notification Center), Windows (system notifications) and Linux (desktop notification server; without action support, a click opens the ticket).
- **mobile**: Not designed.
