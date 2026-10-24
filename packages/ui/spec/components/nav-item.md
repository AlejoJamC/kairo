# nav-item

## Purpose

Navigation entry in the app sidebar and the settings sub-navigation.

## Variants

- Sidebar (`.nav`): 30px, 16px icon, label, mono count; live dot (5px pulse in accent) before the count when the current view has tickets and the engine is classifying. Count in `text.tertiary`; in the current view, `accent.ink`; no tickets, no count. The full sidebar is in sidebar.
- Collapsed sidebar: icon only; the tooltip carries the name and the count ("Triage · 6"). On Triage, when it has tickets, a rail dot (`.rail-dot`): 6px in `accent.default`, 2px ring in `surface.sidebar`, top right of the icon.
- Settings (`.snav`): 32px, 15px icon, no count.

## States

- **default**: `text.secondary`; counts in `text.tertiary` (`sla.overdueText` when there are overdue tickets).
- **hover**: `surface.hover`, `text.primary`.
- **active**: Sidebar: `surface.panel` with `border.default` ring and `shadow.xs`. Settings: `surface.hover`.
- **disabled**: Unavailable view: opacity 0.6, no hover, count hidden.
- **loading**: Live dot while the view is updating.
- **error**: Count failed to load: the count shows — in `text.tertiary` with a 5px `color.bad` dot.

## Accessibility

- Use `<button>` or `<a>` with `aria-current="page"` on the current view; the sidebar is a `<nav>` with `aria-label`.
- The count carries visually hidden text ("12 tickets"); the live dot and the rail dot are decorative.
- Collapsed, `aria-label` keeps the label and the tooltip keeps label and count.

## Domain value

Sidebar order: Triage, Awaiting customer, Resolved, Escalated, AI Classification, Knowledge, then Clients and Settings. Settings order: Workspace, Team, Integrations, Triage Engine, SLA by priority, Billing, Security, API & Webhooks. Knowledge base articles are managed in the Knowledge view, not in Settings.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the sidebar goes full width, always expanded, and the settings sub-navigation stacks above the content.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
