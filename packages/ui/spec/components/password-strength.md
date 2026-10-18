# password-strength

## Purpose

Shows password strength and requirements.

## Variants

- Four 4px bars with a mono label (—, weak, fair, good, strong); requirement list linked to the field.

## States

- **default**: Bars fill in bad (1), warn (2) or ok (3–4); the rest in `border.strong`. Met requirement: ok check and `text.primary`; pending: dot and `text.tertiary`.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Save and continue stays disabled until all requirements are met.
- **loading**: Not applicable.
- **error**: Once both fields are filled and they differ, the match requirement shows an x in `color.bad-ink` and the confirmation field takes a `color.bad` border.

## Accessibility

- Requirements linked with `aria-describedby`; bars are `aria-hidden`.

## Domain value

Requirements: at least 8 characters, at least one letter and one number, both passwords match.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
