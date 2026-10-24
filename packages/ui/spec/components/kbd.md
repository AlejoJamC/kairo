# kbd

## Purpose

Shows a keyboard shortcut.

## Variants

- Default: mono 10.5px, min 17px, `border.strong`, `surface.sunken`, radius xs.
- Large (`.lg`, web): 26px, 12px in `text.primary`, radius sm, 1px bottom edge in `border.strong`.
- Combined keys are separate elements with a 4–5px gap. Inside a button, a modifier shortcut goes in one element (see button).
- Key sequences (P then 1) are shown as separate elements.

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

The official list is in command-palette (Commands scope): J/K navigate, A acknowledge, R resolve, E escalate, N internal note, ⌘↵ send, ⌘⇧↵ send and resolve, ⌘J ask Kairo Assistant (opens Assistant with focus in its field, with or without a ticket), ⌘K commands, ⌘, settings, ⌃⌘S sidebar, ⌘⇧F ticket list, ⌘1 to ⌘4 context tabs, P then 0 to 3 Triage priority filter, ⌘⇧L switch theme, ⌘/ all commands (also ⌘?, and ? outside text fields), esc close. Always visible: only A, R, E and N (inside their buttons), Send, J/K, ⌘K and ⌘/; every other shortcut is found in command-palette and app-menu.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
