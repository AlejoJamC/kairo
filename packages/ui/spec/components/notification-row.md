# notification-row

## Purpose

One entry in the activity popover.

## Variants

- Activity: 7px event dot, who 500 + what + mono target in `accent.ink`, mono time, unread dot.
- Mention: 26px avatar, "[name] mentioned you in [target]", excerpt on `notes.background`.

## States

- **default**: As described in Variants.
- **hover**: `surface.hover`.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Rows are buttons; the popover is a dialog with `aria-label`.

## Domain value

SLA breaches and mentions from teammates.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
