# tabs

## Purpose

Switches panels inside the context panel.

## Variants

- Underlined tabs (`.tab`): 42px, 18px gap, 2px accent underline on the active tab.
- AI tab: 6px accent dot before the label.
- Unread: count badge; totals: mono count.

## States

- **default**: `text.tertiary`.
- **hover**: `text.primary`.
- **active**: `text.primary` with accent underline.
- **disabled**: Unavailable tab (for example with no ticket selected): `text.tertiary` at opacity 0.6, no hover, `aria-disabled="true"`.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `role="tab"` inside `role="tablist"`.

## Domain value

Client, Assistant, Notes, Escalate.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
