# status-bar

## Purpose

Fixed bar at the bottom of the app: the shortcuts of the current view and the engine status.

## Variants

- `.statusbar`: `size.statusbar` on `surface.sidebar`, `border.default` top border, padding 0 14px, 11.5px in `text.tertiary`, single line. Left to right:
  - View group (`.sb-grp.sb-view`, 16px gap): shortcuts (`.sbi`, kbd + verb, 5px gap). J K navigate in every queue view; A acknowledge · R resolve · E escalate · N internal note only with an editable ticket open.
  - Separator (`.sb-sep`): 1×14px in `border.strong`, 12px on each side; only when the view group is shown.
  - Fixed group (`.sb-grp.sb-fixed`): ⌘K commands · ⌘/ all commands. ⌘/ opens command-palette in the Commands scope.
  - Flexible space (16px minimum).
  - Engine status in mono with a 6px ok pulse dot ("kairo · 6 open").
- Ticket open: view group, separator, fixed group, status.
- Queue view without an editable ticket: J K navigate, separator, fixed group, status.
- Page views (Clients, Knowledge, Settings): only the fixed group, no separator, and the status.
- When space is short, whole shortcuts of the view group drop out, last to first, never half of one. The fixed group and the status are never cut.

## States

- **default**: As described in Variants.
- **hover**: Not applicable: shortcuts are text, not buttons.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: While the engine classifies, the dot keeps its pulse and the text reads "kairo · classifying…".
- **error**: Engine offline: the status dot turns `color.bad` without pulse and the status text is shown in `color.bad-ink`.

## Accessibility

- `<footer aria-label="Shortcuts and engine status">`. Shortcuts are informative text with `<kbd>`; the separator and the dot are `aria-hidden`; the status is text.

## Domain value

Shows the open tickets of the Acme Support inbox and the shortcuts that apply in the current view.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component; ⌘ is Ctrl on Windows and Linux.
- **mobile**: Not designed. Hidden below 980px.
