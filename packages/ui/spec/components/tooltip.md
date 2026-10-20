# tooltip

## Purpose

Short text label for controls that show no visible label. Ships on the collapsed sidebar nav items.

## Variants

- Base: `surface.inverse` with `text.inverse` at 12px/1.45, padding 4px 8px, `radius.control`, `shadow.pop`, single line, max width 240px. Placed 8px to the right of the trigger in the sidebar, above the trigger elsewhere.
- With shortcut: the key in mono 11px `color.inverse-faint` after the label.

## States

- **default**: Hidden.
- **hover**: Appears after 400ms on hover of the trigger and hides when the pointer leaves.
- **active**: Appears immediately when the trigger receives keyboard focus.
- **disabled**: Not shown for disabled triggers.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `role="tooltip"`; the trigger references it with `aria-describedby` and keeps its own `aria-label`.
- esc hides it without moving focus.
- Never holds interactive content or information that is not available elsewhere.

## Domain value

Keeps the collapsed sidebar usable: Triage, Awaiting customer, Resolved, Escalated, AI Classification, Knowledge, Clients and Settings stay identifiable by name.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not shown; there is no hover on touch screens.
