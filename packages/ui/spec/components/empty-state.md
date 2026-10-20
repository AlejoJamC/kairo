# empty-state

## Purpose

Explains an empty view and the next step.

## Variants

- List empty: mono ◌ glyph in `border.strong`, 14px/500 title, 12.5/1.5 explanation in `text.tertiary` (max 260px), pulse dot in `accent.default` while scanning. In the queue, padding 110px 20px 48px; the text of each view is in queue-header.
- No selection (ticket): 44px envelope icon in `border.strong` (stroke 1.4), "Select a ticket to see its details" in 13.5px, J K hint "to move through the queue" in 11.5px; centered in the ticket pane.
- No selection (context panel): one 13px line in `text.tertiary`, padding 18px, left aligned, upright text: "Select a ticket to see its context." With no tickets in the inbox: "Client data unavailable."
- Pending: dashed `border.strong` container, `radius.card`, padding 56px 24px, centered bracketed text in `text.tertiary` ("[Billing — pending reference]"). Only for sections without a design: Settings › Billing and API & Webhooks.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Scanning: pulse dot before the explanation.
- **error**: Load error: same layout with an alert glyph in `color.bad-ink`, a title, the explanation and Retry (secondary).

## Accessibility

- Text only; no illustrations or emoji. Glyph and icon are `aria-hidden`.
- The title is plain text, not a heading.
- The queue empty state while scanning sits in an `aria-live="polite"` region, so arriving tickets are announced.

## Domain value

Empty inbox, no internal notes yet, no mentions, no clients matching the filters, no knowledge articles yet.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the top padding is 48px instead of 110px.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
