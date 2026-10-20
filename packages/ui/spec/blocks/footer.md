# footer

## Purpose

Public web footer.

## Variants

- On `surface.sidebar` with a top border: brand with one line of description, four nav columns (Product, Resources, Company, Legal), bottom bar with copyright and web version in mono.
- Auth: one centered mono line with Terms, Privacy and copyright.

## States

- **default**: As described in Variants.
- **hover**: Link hover.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Each column is a `<nav aria-label>`.

## Domain value

Links to legal pages, docs and status.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
