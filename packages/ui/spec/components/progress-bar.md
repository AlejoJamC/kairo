# progress-bar

## Purpose

Shows the progress of the initial inbox scan.

## Variants

- 6px bar on `surface.hover`, accent fill, width transition 150ms; mono legend with percentage and status.

## States

- **default**: Running: "classifying…" with pulse in `accent.ink`.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: This component is a loading state.
- **error**: Scan failed: the fill turns `color.bad`, the legend reads the failure in `color.bad-ink`, and Retry (primary lg) replaces the CTA.

## Accessibility

- `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`; title in a polite live region.

## Domain value

Onboarding scan: emails read, tickets created, customers.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
