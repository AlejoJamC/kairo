# kbd

## Purpose

Shows a keyboard shortcut.

## Variants

- Default: mono 10.5px, min 17px, `border.strong`, `surface.sunken`, radius xs.
- Large (`.lg`, web): 26px, 12px in `text.primary`, radius sm, 1px bottom edge in `border.strong`.
- Combined keys are separate elements with a 4–5px gap.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Decorative when the action is also reachable by button; the shortcut is repeated in the button `title`.

## Domain value

Shortcuts: J/K navigate, A acknowledge, R resolve, E escalate, N internal note, ⌘K commands, ⌘↵ send, ⌘J ask the assistant, ⌘, settings, ? shortcuts, esc close.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
