# plan-card

## Purpose

One pricing plan.

## Variants

- Card, padding 24px: name (18px), description, price (40px/600) with period, CTA md full, inclusion list with ok checks.
- Recommended: accent ring with `shadow.frame` and a Recommended chip; primary CTA. Only one plan.
- Standard: secondary CTA.
- Custom: `surface.sidebar`, price as text, Talk to sales.

## States

- **default**: As described in Variants.
- **hover**: CTA hover.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Plan name is a heading; inclusion list is a `<ul>`.

## Domain value

Prices are placeholders in the approved design.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
