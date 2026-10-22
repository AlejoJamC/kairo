# triage

## Purpose

Main cockpit where the support agent works the queue.

## Variants

- Shell, left to right: sidebar (`layout.sidebar`, collapsible to `layout.sidebar-collapsed`) · queue (`layout.queue`) · ticket (flexible, reading width `layout.reading`) · context panel (`layout.context`); status-bar (`size.statusbar`) at the foot. command-palette (⌘K), shortcuts-dialog (?) and toast sit above everything.
- Queue pane, top to bottom: queue-header · suggestion callout (Triage only) · ticket-row list · loading skeleton or empty-state.
- Ticket pane, top to bottom: ai-proposal (AI Classification › To review only) · ticket-bar · reading column with ticket-heading, evidence-panel and thread-message entries · composer, or read-only-bar for a ticket in a final status.
- Context panel: tabs Client · Assistant · Notes · Escalate, with client-panel, assistant-turn plus ask-box, note-card list, and escalate-panel.
- Views, all with the same shell (queue-header defines title, count, filters and empty text of each):
  - Triage: priority filters, Classify, suggestion callout; full composer.
  - Awaiting customer: ticket-row line 3 with the last reply and Follow up; composer opens with a follow-up text and only Escalate.
  - Resolved: read-only tickets: ticket-bar "Read only" chip, read-only ticket-heading, evidence-panel without row actions, read-only-bar, escalate-panel without form.
  - Escalated: escalated tickets; ticket-bar shows the escalated pill.
  - AI Classification: filter-pill tabs To review / Approved by the AI; ai-proposal above ticket-bar in To review.
- No selection: the ticket pane shows the no-selection empty-state and the context panel its "Select a ticket to see its context." line.
- Popovers of this screen: status-chip menu, priority menu of ticket-heading, reclassify-popover, mention-menu, split send menu of button, notification-row activity and account-menu (see popover).

## States

- **default**: A ticket selected in the Triage view.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Resolved tickets are read only.
- **loading**: Tier 2 classifying: skeleton rows at the end of the queue.
- **error**: Inbox disconnected: the queue shows the empty-state error variant with Reconnect Gmail (primary), and the status bar dot turns `color.bad`.

## Accessibility

- Keyboard first: J/K, A, R, E, N, ⌘K, ⌘↵, ⌘⇧↵, ⌘J, ?; panes are labeled landmarks. The full list is in shortcuts-dialog.

## Domain value

Prioritized queue with AI classification, evidence and a human decision on every action, for the support inbox support@acme.com.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the panes stack and the status bar is hidden.
- **desktop**: Triage desktop app, same layout. macOS adds window-chrome (controls slot and drag areas), the sidebar desktop variant, app-menu, system-notification and dock-badge; Windows and Linux use the native frame.
- **mobile**: Not designed.
