# callout

## Purpose

Inline notice inside a page or panel.

## Variants

- Neutral (`.callout`): `surface.sunken`, `border.default`, 12.5/1.5 `text.secondary`, radius row.
- AI (`.callout.ai`): `accent.soft` with `accent.line` inset; text in `text.primary`.
- Error (`.callout.bad`): `color.bad-soft` with `color.bad-line` inset; text in `color.bad-ink`.
- Suggestion: `accent.soft` row with a link icon, an action link and Dismiss.
- Internal / attention: `notes.background` with an info icon; draft-client notice and escalation signals.
- Read-only strip: centered `surface.sunken` footer with a lock.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: The error variant, with `role="alert"`.

## Accessibility

- Error callouts use `role="alert"`; icons are `aria-hidden`.

## Domain value

Group similar tickets, draft client detected, escalation signals, login errors, resolved ticket in read-only mode.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
