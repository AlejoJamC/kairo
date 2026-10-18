# triage

## Purpose

Main cockpit where the support agent works the queue.

## Variants

- Shell: sidebar (232px, collapsible to 60px), queue (372px), ticket (flexible, reading width 780px), context panel (344px), status bar (28px).
- Views: Triage, Awaiting customer, Resolved (read only), Escalated, AI Classification (to review / approved by AI).
- Context panel tabs: Client, Assistant, Notes, Escalate.

## States

- **default**: A ticket selected in the Triage view.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Resolved tickets are read only.
- **loading**: Tier 2 classifying: skeleton rows at the end of the queue.
- **error**: Inbox disconnected: the queue shows the empty-state error variant with Reconnect Gmail (primary), and the status bar dot turns `color.bad`.

## Accessibility

- Keyboard first: J/K, A, R, E, N, ⌘K; panes are labeled landmarks.

## Domain value

Prioritized queue with AI classification, evidence and a human decision on every action.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the panes stack and the status bar is hidden.
