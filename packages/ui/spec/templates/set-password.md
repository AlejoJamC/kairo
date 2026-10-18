# set-password

## Purpose

Create or reset a password.

## Variants

- Modes: new and reset (different title). Password field with strength meter and requirements, confirmation field, Save and continue.

## States

- **default**: Empty form.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Save and continue disabled until requirements are met.
- **loading**: Not applicable.
- **error**: Expired link or failed save: a bad callout above Save and continue; a mismatch uses the password strength error state.

## Accessibility

- See password-strength.

## Domain value

Account access after an invitation or a reset link.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
