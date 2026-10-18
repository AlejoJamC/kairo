# stepper

## Purpose

Shows the onboarding wizard step.

## Variants

- Ordered list of steps, 20px mono number circles joined by 28×1px `border.strong` lines; labels hidden on mobile.

## States

- **default**: Pending: `border.strong` ring, `text.tertiary`.
- **hover**: Not applicable.
- **active**: Current: accent circle with white number, 500 label, `aria-current="step"`.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `<ol aria-label>`; connectors are `aria-hidden`.

## Domain value

Three steps: Connect, Detect, Done. A completed step style is not defined in the approved design.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
