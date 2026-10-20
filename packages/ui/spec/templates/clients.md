# clients

## Purpose

List of customers detected from the inbox.

## Variants

- Shell: sidebar · page view (`.page`) · status-bar.
- Page, top to bottom: page-header with count ("Clients 6") · kpi-strip · toolbar: filter-pill tabs (All, Drafts, Confirmed, Rejected) · divider · organization select pill · plan toggle pills (Enterprise, Pro, Starter, Churn risk) · second line: search (max 420px) · flexible space · Export (secondary, `size.control-lg`) and Add client (primary, `size.control-lg`) · data-table.
- data-table rows: 32px avatar, name 500 with the draft-client badge, mono sub-line (support@acme.com), plan, MRR, ticket count as a link, CSAT, last contact; unknown values as —.
- No results: data-table empty row "No client matches these filters."

## States

- **default**: Table with rows.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: KPI strip and data table in their loading states; filters stay visible.
- **error**: Data table error state with Retry; KPI values show —.

## Accessibility

- Search field has a label; table header is visible. One `<h1>`: the page-header title.

## Domain value

Customers are detected automatically and start as drafts, such as Acme with support@acme.com.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the toolbar wraps and the table scrolls inside its card.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
