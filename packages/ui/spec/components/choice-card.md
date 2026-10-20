# choice-card

## Purpose

Selects the channel to connect in onboarding.

## Variants

- 88px min button, padding 14px, radius input, in a three-column grid; channel icon 20px, name, availability in mono.

## States

- **default**: Available, not selected: not defined separately in the approved design.
- **hover**: Available, not selected: `border.strong` border and `surface.hover` fill.
- **active**: Selected: `accent.soft` with `accent.line` inset, icon and check in `accent.ink`, "available" in ok-ink.
- **disabled**: Coming soon: dashed `border.strong`, `text.tertiary`, "coming soon".
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `<button aria-pressed>` inside a `<fieldset>` with a legend.

## Domain value

Gmail available; Slack and WhatsApp coming soon; Telegram and Instagram noted below the grid.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
