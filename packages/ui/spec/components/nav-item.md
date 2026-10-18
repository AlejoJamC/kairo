# nav-item

## Purpose

Navigation entry in the app sidebar and the settings sub-navigation.

## Variants

- Sidebar (`.nav`): 30px, 16px icon, label, mono count; live dot (5px pulse in accent) before the count.
- Collapsed sidebar: icon only, label kept in `title`.
- Settings (`.snav`): 32px, 15px icon.

## States

- **default**: `text.secondary`; counts in `text.tertiary` (`sla.overdueText` when there are overdue tickets).
- **hover**: `surface.hover`, `text.primary`.
- **active**: Sidebar: `surface.panel` with `border.default` ring and `shadow.xs`. Settings: `surface.hover`.
- **disabled**: Unavailable view: opacity 0.6, no hover, count hidden.
- **loading**: Live dot while the view is updating.
- **error**: Count failed to load: the count shows — in `text.tertiary` with a 5px `color.bad` dot.

## Accessibility

- Use `<button>` or `<a>`; the sidebar is a `<nav>` with `aria-label`.

## Domain value

Order: Triage, Awaiting customer, Resolved, Escalated, AI Classification, Knowledge, then Clients and Settings.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
