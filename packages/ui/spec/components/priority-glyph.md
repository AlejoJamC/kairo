# priority-glyph

## Purpose

Shows ticket priority as three ascending bars.

## Variants

- 14px (rows) and 12px (chips, filters, menus); 14×14 viewBox.

## States

- **default**: P1: three bars `priority.P1`. P2: two bars `priority.P2` + one `priority.track`. P3: one bar `priority.P3` + two `priority.track`.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Always paired with its mono label (P1) or `title`; never color alone.

## Domain value

TicketPriority: P1, P2, P3.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Mobile companion app: 16px glyph in the ticket list item, always with the mono P1, P2 or P3 label at 12px.
