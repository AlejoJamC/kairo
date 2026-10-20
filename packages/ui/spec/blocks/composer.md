# composer

## Purpose

Reply and internal-note composer of a ticket.

## Variants

- Fixed at the foot of the ticket pane, `border.default` top border, padding 10px 20px 14px, max width `layout.reading`.
- Mode row (8px gap): mode segmented (Reply / Internal note, `role="tablist"`) · 12px hint in `text.tertiary` with ellipsis: "Sends to support@acme.com" in Reply, "Visible only to your team" in Internal note · quick reply (bolt) and attach (clip) icon buttons.
- Note row (Internal note only): team-only badge · mention chips of mention-menu · "Type @ to mention a teammate" in 11.5px `text.tertiary`.
- 3-row textarea (`typography.reply`, `radius.input`, padding 10px 12px) with its label. Placeholder: "Write your reply to [client]…" or "Add an internal note — type @ to mention…".
- Action row (6px gap): buttons with key (see button) "Acknowledge A", "Resolve R", "Escalate E" · flexible space · split Send.
- Reply mode: `surface.panel`; textarea on `surface.sunken` with `border.default`; Send on `accent.default` with its menu ("Send and resolve", ⌘⇧↵). Send leaves the ticket awaiting the customer and takes it out of the Triage queue.
- Internal note mode: container on `notes.background` with a `notes.border` top border, textarea on `surface.panel` with `notes.border`, the note row appears, and Send becomes `.send.note`: lock + "Add note", no menu. The note goes to the thread and the Notes tab; mentioned people get notified.
- Awaiting customer: opening a ticket from that view fills the textarea with a follow-up ("Hi [name], did you get a chance to review our previous reply? We are here to help.") and the action row shows only "Escalate E": Acknowledge and Resolve do not apply while waiting for the customer.
- Final status: no composer; read-only-bar takes its place.
- Quick reply fills the textarea in Reply mode with a short acknowledgement ("Hi [name], we received your report and are looking into it. We will write as soon as we have news."); the agent edits it before sending.
- Mentions: typing @ in Internal note opens mention-menu.

## States

- **default**: Reply mode, empty textarea, Send disabled.
- **hover**: As in segmented, button and icon buttons.
- **active**: Internal note mode. Focused textarea: `accent.line` border in Reply, `notes.label` in Internal note.
- **disabled**: Send and Add note disabled (0.55) while empty.
- **loading**: Sending: Send shows a white spinner and is disabled; the textarea becomes read-only and the mode switch is disabled. On success the textarea empties and a toast confirms ("Reply sent to Acme", "Note added · [name] notified").
- **error**: Send failed: a bad callout with Retry appears above the textarea; the text is kept.

## Accessibility

- Textarea with a label that follows the mode ("Reply" / "Internal note"); the hint goes in `aria-describedby`.
- ⌘↵ sends; ⌘⇧↵ sends and resolves; N switches to Internal note from outside the textarea.
- Buttons with a key carry `aria-keyshortcuts`. See mention-menu for the mentions keyboard.

## Domain value

Resolved tickets replace the composer with read-only-bar. The agent answers support@acme.com, or leaves an internal note for a teammate that the customer never sees.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint`, padding 10px 16px 14px; the kbd inside buttons is hidden and the action row may wrap, with Send always on the right.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
