# clients

## Purpose

List of customers detected from the inbox.

## Variants

- Title with count, KPI strip, filter pills (All, Drafts, Confirmed, Rejected), organization select, plan pills, search (max 420px), Export and Add client, data table.

## States

- **default**: Table with rows.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: KPI strip and data table in their loading states; filters stay visible.
- **error**: Data table error state with Retry; KPI values show —.

## Accessibility

- Search field has a label; table header is visible.

## Domain value

Customers are detected automatically and start as drafts.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
