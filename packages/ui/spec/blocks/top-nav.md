# top-nav

## Purpose

Public web navigation bar.

## Variants

- Sticky, 60px, `surface.glass` with blur and a bottom border, inside the page container: brand, links (Product, How it works, Security, Pricing, Changelog), language segmented, Sign in link, Start free (primary md).
- Auth header: 64px with brand and language only.
- Wizard header: 60px with brand, stepper and Exit (ghost).

## States

- **default**: As described in Variants.
- **hover**: Links: `surface.hover`, `text.primary`.
- **active**: Current link in `text.primary`.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `<nav aria-label>`; mobile menu button with `aria-expanded`.

## Domain value

Entry point to sign in and to onboarding.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px links, language and sign-in hide and a 44px menu button opens a stacked menu with 44px links.
