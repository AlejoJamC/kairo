# section

## Purpose

Anatomy of a public web section.

## Variants

- Container: max 1200px, 32px margin (16px on mobile); narrow 960px.
- Rhythm: 120px top and bottom (88px below 980px, 72px below 720px); sections separated by a top border.
- Header: numbered eyebrow, d2 title, body (max 600px).
- Backgrounds alternate `surface.page` and `surface.sidebar`; one dark band per page.
- Grid background: lines every 64px with a radial mask, only in hero, final CTA, auth and wizard.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- The grid background is `aria-hidden`.

## Domain value

Structures the landing, pricing and legal pages.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
