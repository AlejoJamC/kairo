# status-panel

## Purpose

Single-action status card.

## Variants

- Card max 440px with `shadow.pop`: 44px icon box, 22px title, description, primary action and Back to home.
- Error: alert icon in `color.bad-ink` on `color.bad-soft`; footer on `surface.sunken` with the error code in mono and Contact support.
- Neutral: icon box (for example an expired invitation), centered, one secondary action.

## States

- **default**: As described in Variants.
- **hover**: Button hovers.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Error variant with `role="alert"`. Reasons: access denied, link expired, domain not allowed, unknown.

## Accessibility

- Error card uses `role="alert"`.

## Domain value

Authentication errors and expired invitations.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
