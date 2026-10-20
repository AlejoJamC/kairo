# callout

## Purpose

Inline notice inside a page or panel.

## Variants

- Neutral (`.callout`): `surface.sunken`, `border.default`, 12.5/1.5 `text.secondary`, radius row.
- AI (`.callout.ai`): `accent.soft` with `accent.line` inset; text in `text.primary`.
- Error (`.callout.bad`): `color.bad-soft` with `color.bad-line` inset; text in `color.bad-ink`.
- Suggestion (padding 9px 10px 9px 12px): `accent.soft` row with `accent.line` inset, a link icon in `accent.ink`, 12.5px text in `text.secondary`, an action link and Dismiss in `text.tertiary`. Placed under queue-header.
- Internal / attention (padding 10px 12px): `notes.background` with `notes.border` inset and an info icon in `notes.label`, 12/1.5 text in `text.secondary`: draft-client notice in client-panel; with a 600 headline in `notes.label`, the signal summary of escalate-panel.
- The read-only strip of a resolved ticket is not a callout: see read-only-bar.

## States

- **default**: As described in Variants.
- **hover**: Only the action link (underline) and Dismiss (`text.primary`).
- **active**: Pressing the suggestion action runs it and the notice disappears; Dismiss hides it for that view.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: The error variant, with `role="alert"`.

## Accessibility

- Error callouts use `role="alert"`; icons are `aria-hidden`. Suggestion and internal notices are plain text.
- Dismiss is a `<button>` with `aria-label` "Dismiss suggestion".
- `text.secondary` on `notes.background` is 7.45:1; `color.bad-ink` on `color.bad-soft` is 5.05:1.

## Domain value

Group similar tickets, draft client detected, escalation signals, login errors.

## Platforms

- **web**: Triage app in the browser and the public web. Below `layout.breakpoint` the action and Dismiss may wrap to a second line.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: Not designed.
