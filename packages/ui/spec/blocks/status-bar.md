# status-bar

## Purpose

Fixed bar at the bottom of the app.

## Variants

- 28px on `surface.sidebar`: shortcuts of the current view on the left (Kbd + verb), engine status in mono with an ok pulse on the right.
- Queue views: J K navigate · A acknowledge · R resolve · E escalate · N internal note, then ⌘K commands · ? shortcuts. Page views (Clients, Knowledge, Settings): only ⌘K commands · ? shortcuts. ? opens shortcuts-dialog.
- When space is short, the view shortcuts are cut first, never ⌘K or ?.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Pulse dot.
- **error**: Engine offline: the status dot turns `color.bad` without pulse and the status text is shown in `color.bad-ink`.

## Accessibility

- Shortcuts are informative text.

## Domain value

Shows open tickets and the shortcuts of queue views.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component; ⌘ is Ctrl on Windows and Linux.
- **mobile**: Not designed. Hidden below 980px.
