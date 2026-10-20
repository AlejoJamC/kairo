# shortcuts-dialog

## Purpose

Keyboard shortcuts dialog: the complete list of app shortcuts.

## Variants

- Opens with ? or from "Keyboard shortcuts" in account-menu. Same frame as command-palette.
- `surface.scrim` over the whole window and a dialog of `min(560px, 92%)` 110px from the top: `surface.panel`, `border.default`, `radius.dialog`, `shadow.pop`.
- Header (50px, padding 0 16px, `border.default` bottom border): "Keyboard shortcuts" 15px/600 · flexible space · kbd esc.
- Body (padding 6px, max height 420px with scroll): three groups with a `label` header (padding 10px 10px 4px) and rows `.kdlg-row` of 32px: the action in `text.secondary` on the left and its keys (kbd) on the right, 4px gap.
  - Navigation: J K move through the queue · ⌘K commands · ⌘, settings.
  - Ticket: A acknowledge · R resolve · E escalate · N internal note · ⌘↵ send · ⌘⇧↵ send and resolve · ⌘J ask Kairo Assistant.
  - General: ⌘⇧L switch theme · ? keyboard shortcuts · esc close.
- Footer (`surface.sunken`, `border.default` top border, padding 8px 14px, 11px `text.tertiary`): "On Windows and Linux, ⌘ is Ctrl."
- This list is the official set of shortcuts: kbd, status-bar, command-palette and buttons with a key use the same ones.
- Outside a ticket (for example in Clients), the Ticket group rows are shown in `text.tertiary` with "ticket only" in mono 10.5px.

## States

- **default**: Open, focus on the dialog.
- **hover**: Not applicable: rows are not interactive.
- **active**: Not applicable.
- **disabled**: Shortcuts that do not apply in the current view, as described in Variants.
- **loading**: Not applicable: the list is static.
- **error**: Not applicable.

## Accessibility

- `role="dialog"`, `aria-modal="true"` and `aria-labelledby` pointing to the title. Focus is trapped; esc or a scrim click closes it and returns focus where it was.
- Each row is a `<dl>` entry: the action in `<dt>` and the keys in `<dd>` with `<kbd>`.
- ? does not open the dialog while focus is in a text field.

## Domain value

An agent who joins Acme Support learns to work the queue from the keyboard without leaving it.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the dialog takes the width minus 32px and sits 48px from the top.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
