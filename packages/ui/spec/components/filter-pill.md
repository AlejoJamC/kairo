# filter-pill

## Purpose

Filters a data page and the AI Classification view.

## Variants

- Pill (`.pill`): `size.control`, `radius.pill`, `border.default`, 12.5px `text.secondary` on `surface.panel`, padding 0 12px, 6px gap.
- Tab with count (mutually exclusive, one always active): Clients › All · Drafts · Confirmed · Rejected; Knowledge › All · Published · Drafts · To review; AI Classification › To review · Approved by the AI. The `.cnt` count goes inside, after the label: `text.tertiary` on inactive pills; on the active pill, the text color at 70%.
- Toggle (no count; one click turns it on, another turns it off; at most one on per group): Clients › Enterprise · Pro · Starter · Churn risk.
- Select (`select.pill`): the same pill around a native select with a chevron drawn in `text.tertiary` 11px from the right edge ("All organizations").
- Divider (`.pill-div`): 1×20px in `border.default`, 4px margin, between groups.

## States

- **default**: As described in Variants.
- **hover**: `text.primary`, `border.strong`.
- **active**: Inverted: `text.primary` fill, `surface.page` text.
- **disabled**: Opacity 0.6, no hover, `aria-disabled="true"`.
- **loading**: The count shows — until there is data.
- **error**: Without a count, —; the filter still works.

## Accessibility

- Tabs with count: `role="tablist"` with `role="tab"` and `aria-selected`; the name includes the count ("Drafts, 6").
- Toggles: `<button>` with `aria-pressed`.
- Select: visually hidden label ("Organization").
- Inactive counts in `text.tertiary` meet 4.5:1 on `surface.panel`.

## Domain value

Clients filters (status, organization and plan), Knowledge filters and AI Classification (To review, Approved by the AI). Not used inside the ticket flow: there, segmented or chip.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the row wraps and the divider is hidden.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
