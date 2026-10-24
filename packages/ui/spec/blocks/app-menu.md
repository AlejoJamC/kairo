# app-menu

## Purpose

Native menu bar of the desktop app: which menus exist, what each contains, its separators, submenus and keys.

## Variants

- The operating system draws the menu; this spec defines its content. No action exists only here: every item does the same as its counterpart in the app, with the shortcut of the official list (command-palette, Commands scope).
- Menus, in this order (— is a separator):
  - Kairo: About Kairo — Settings… ⌘, — Sign out · Quit Kairo ⌘Q.
  - Edit: the system items: Undo, Redo — Cut, Copy, Paste, Select all.
  - View: Sidebar ⌃⌘S (checkbox, checked when expanded) · Ticket list ⌘⇧F (checkbox, checked when shown) · Context › (single-choice submenu: Client ⌘1 · Assistant ⌘2 · Notes ⌘3 · Escalate ⌘4) — Switch theme ⌘⇧L · Language › (single-choice submenu: Español · English).
  - Go: Search or run a command… ⌘K — Triage · Awaiting customer · Resolved · Escalated · AI Classification · Knowledge — Clients · Settings (single choice, the current view checked) — Next ticket J · Previous ticket K.
  - Ticket: Acknowledge A · Resolve R · Escalate E · Internal note N — Send ⌘↵ · Send and resolve ⌘⇧↵ — Priority › (P1 · P2 · P3) · Status › (the statuses of status-chip) · Wrong classification?… · Group with [ID] — Ask Kairo Assistant ⌘J.
  - Window: the system items: Minimize, Zoom — Bring all to front.
  - Help: All commands ? (opens command-palette in the Commands scope).
- There is no File menu: Kairo does not work with files.
- Icons only on the ticket actions, 13px in their semantic color, as in the app: Acknowledge (check, `accent.default`), Resolve (`color.ok`), Escalate (arrow, `color.mood`), Internal note (lock, `notes.label`) and Ask Kairo Assistant (filled spark in `accent.default`). The rest of the menu shows text, checkbox or choice marks and keys.
- Sentence case and the same labels as the app. An item that opens something where the user keeps deciding ends in "…".
- "Group with [ID]" appears only when the ticket has a similar ticket not grouped yet (same rule as evidence-panel).
- Single-key shortcuts (A, R, E, N, J, K) are shown in the menu but are not registered as menu accelerators: they never fire while focus is in a text field, as in the app.
- Windows and Linux: the same structure and labels in the menu bar of the native frame; ⌘ is Ctrl, and Window has no "Bring all to front".

## States

- **default**: As described in Variants.
- **hover**: Drawn by the system.
- **active**: The current view checked in Go; Sidebar and Ticket list checked when shown; the current tab in View › Context; the current language in View › Language; current priority and status checked in their submenus.
- **disabled**: Outside queue views, View › Ticket list is disabled. With no ticket open, View › Context and the whole Ticket menu are disabled. With an empty composer, Send and Send and resolve are disabled. On a ticket in a final status, every Ticket item is disabled except Ask Kairo Assistant. In Awaiting customer, Acknowledge and Resolve are disabled, as in composer.
- **loading**: Not applicable: the menu reflects the app state when it opens.
- **error**: Not applicable: if an action fails, the app says so with a toast.

## Accessibility

- It is the native menu: system screen readers and keyboard navigation (F10 on Windows and Linux, Ctrl F2 on macOS).
- Every item carries the same name as the equivalent button or entry in the app.

## Domain value

An agent at Acme Support who prefers menus finds every queue and ticket action in the menu bar, with the same keys as in the app.

## Platforms

- **web**: Not applicable: in the browser the same actions are in the app and in command-palette.
- **desktop**: macOS, Windows and Linux, as described in Variants.
- **mobile**: Not designed.
