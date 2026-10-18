# composer

## Purpose

Reply and internal-note composer of a ticket.

## Variants

- Mode segmented (Reply / Internal note), hint, quick reply and attach icon buttons, 3-row textarea, ticket actions (Acknowledge, Resolve, Escalate), split Send.
- Internal note mode: container on `notes.background`, textarea border `notes.border`, team-only badge, mention chips, Send on `notes.sendAction`.
- Mentions popover: 300px list with avatar, name and mono role; ↵ insert, esc close.

## States

- **default**: Reply mode.
- **hover**: Not applicable.
- **active**: Internal note mode.
- **disabled**: Send disabled while empty.
- **loading**: Sending: Send shows a white spinner and is disabled; the textarea becomes read-only and the mode switch is disabled.
- **error**: Send failed: a bad callout with Retry appears above the textarea; the text is kept.

## Accessibility

- Textarea with a label; send with ⌘↵.

## Domain value

Resolved tickets replace the composer with the read-only strip.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
