# status-chip

## Purpose

Shows and changes the ticket status.

## Variants

- Chip in `text.primary` 500 with a 12px half-circle glyph and a chevron; opens a 210px menu.
- Read-only: chip with a lock and "Read only" for tickets in a final status (resolved, ai_resolved, closed).

## States

- **default**: Glyph color from the `status` scale: open, awaiting_customer, in_progress, resolved, ai_resolved, escalated, reopened, closed.
- **hover**: Chip hover.
- **active**: Menu open; current option marked `.on`.
- **disabled**: Read-only variant.
- **loading**: Updating: the glyph is replaced by an 11px spinner and the chip is disabled.
- **error**: Update failed: the chip returns to the previous status and an error toast explains it.

## Accessibility

- `role="menu"` / `menuitem`; every option has a dot and its label.

## Domain value

Every TicketStatus value: open, awaiting_customer, in_progress, resolved, ai_resolved, escalated, reopened, closed.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
