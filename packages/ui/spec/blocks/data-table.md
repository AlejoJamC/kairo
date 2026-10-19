# data-table

## Purpose

Data table of a page.

## Variants

- Card with horizontal scroll; header row in the `label` style; rows with a top border, 12×18 padding, min 820px. Main cell: 32px avatar, name 500, mono sub-line, draft badge.

## States

- **default**: As described in Variants.
- **hover**: Rows that open a record take `surface.hover` and a pointer cursor.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Six skeleton rows: a 32px skeleton circle and two bars in the main cell, one bar per other column.
- **error**: The body is replaced by a centered 13px `color.bad-ink` message with Retry (secondary); filters stay usable.

## Accessibility

- Header cells are visible text; the table scrolls inside its card, not the page.
- Tertiary text stays at 4.5:1 or more on `surface.hover` and on `accent.soft`, so labels and metadata keep AA contrast on hover, inside the segmented track and on selected rows.

## Domain value

Clients: Plan, MRR, Tickets, CSAT, Last contact. Empty: "No clients match these filters."

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
