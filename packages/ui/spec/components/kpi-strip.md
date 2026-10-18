# kpi-strip

## Purpose

Row of key figures.

## Variants

- App: card grid, cells 16×18 with a right divider; key in `label` style, value in the kpi style (24px/600).
- Web (onboarding): mono 500 counts, 30px during the scan and 22px in the summary; urgent count in `color.bad-ink`.

## States

- **default**: Missing values shown as —; never sample numbers.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Each value is replaced by a skeleton bar 60px wide at the value height.
- **error**: Values show — and one 12px `color.bad-ink` line with Retry appears under the strip.

## Accessibility

- Each value is preceded by its visible label.

## Domain value

Clients totals; onboarding emails read, tickets created, customers, urgent.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Mobile companion app: metric cards in a two-column grid with a 12px gap; each card on `surface.panel` with `border.default`, radius card and 14px padding, label in the `label` style and value in mono 22px/500. An urgent value uses `color.bad-ink`.
