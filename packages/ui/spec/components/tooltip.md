# tooltip

## Purpose

Short floating label that names a control with no visible label and shows its shortcut.

## Variants

- Base (`.tip`): `surface.inverse` with `text.inverse` at 12px/1.45, padding 4px 8px, `radius.control`, `shadow.pop`, 8px gap, single line, max width 240px. Placed 8px to the right of the trigger in the sidebar, above the trigger elsewhere.
- With shortcut: the key in mono 11px `color.inverse-faint` after the label ("Expand sidebar ⌃⌘S", "Assistant ⌘2").
- Where it is used: icon buttons without a visible label (collapse and expand the sidebar, hide and show the ticket list, collapsed language), nav-item entries of the collapsed sidebar (name and count, "Triage · 6") and the tabs of the context panel (name and key). The text is the same as the `aria-label` of the control.

## States

- **default**: Hidden.
- **hover**: Appears after 400ms on hover of the trigger and hides when the pointer leaves.
- **active**: Appears immediately when the trigger receives keyboard focus.
- **disabled**: Not shown for disabled triggers.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `role="tooltip"`; the trigger references it with `aria-describedby` and keeps its own `aria-label` and, when there is one, `aria-keyshortcuts`.
- esc hides it without moving focus.
- Never holds interactive content or information that is not available elsewhere.

## Domain value

Keeps the collapsed sidebar and the icon controls usable: views stay identifiable by name and count, and every hidden shortcut is one hover away.

## Platforms

- **web**: Triage app in the browser. ⌘ is Ctrl on Windows and Linux.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not shown; there is no hover on touch screens.
