# command-palette

## Purpose

Search tickets, run actions, navigate, and list every command of the app with its keys. Opens with ⌘K (All scope) or ⌘/ (Commands scope; also ⌘?, and ? outside text fields). Uses the dialog overlay pattern; see dialog for task dialogs.

## Variants

- Scrim over the whole window; dialog min(600px, 92%) at 110px from the top, `surface.panel`, `border.default`, radius dialog, `shadow.pop`.
- Input row (50px, padding 0 14px, `border.default` bottom border): magnifier · "Search tickets or type a command…" at 15px · kbd esc.
- Scope row (padding 8px 12px, `border.default` bottom border): segmented All ⌘K · Commands ⌘/ in a `role="tablist"`, the key inside each segment · flexible space · in Commands, the total count ("37 commands").
- Results (padding 6px, max height 420px with scroll):
  - All: sections Tickets (38px rows: 12px priority-glyph, mono ID, subject, where it is) · Actions (icon in its semantic color, name, kbd) · Go to. The last row, "See all commands" with kbd ⌘/, in `text.tertiary`, switches to the Commands scope.
  - Commands: the complete list in four groups, 34px rows with the name and its keys on the right:
    - Ticket: Acknowledge A · Resolve R · Escalate E · Internal note N · Send ⌘↵ · Send and resolve ⌘⇧↵ · Ask Kairo Assistant ⌘J · Change priority · Change status · Wrong classification?… · Group with similar ticket.
    - Go to: Next ticket J · Previous ticket K · Search tickets ⌘K · Triage · Awaiting customer · Resolved · Escalated · AI Classification · Knowledge · Clients · Settings ⌘,.
    - View: Show or hide the sidebar ⌃⌘S · Show or hide the ticket list ⌘⇧F · Context: Client ⌘1 · Context: Assistant ⌘2 · Context: Notes ⌘3 · Context: Escalate ⌘4 · Filter by priority: All P 0 · Filter by priority: P1 P 1 · Filter by priority: P2 P 2 · Filter by priority: P3 P 3 · Switch theme ⌘⇧L · Language: [the other language].
    - General: All commands ⌘/ · Close esc · Sign out.
- Key sequences: the priority filters are P and then 0, 1, 2 or 3, and set the priority filter of the Triage view (see queue-header).
- Ask Kairo Assistant (⌘J) opens the Assistant tab of the context panel and puts focus in its question field (ask-box). It works with no ticket open: it is the only Ticket command that is never disabled.
- Footer (`surface.sunken`, `border.default` top border, padding 8px 14px, 11px `text.tertiary`): ↵ run first · tab switch tab · esc close · on the right "On Windows and Linux, ⌘ is Ctrl".
- This list is the official set of shortcuts: kbd, status-bar, app-menu, tabs and buttons with a key use the same ones.
- Always visible in the interface: only the shortcuts used on almost every ticket (A, R, E and N inside their buttons, Send, J/K, ⌘K and ⌘/). Every other command is found here and in app-menu.

## States

- **default**: Open in its scope, focus in the input.
- **hover**: Row hover.
- **active**: Keyboard-highlighted row; ↵ runs the first or highlighted row and closes the palette.
- **disabled**: In Commands, commands that do not apply are shown disabled in `text.tertiary`; Ticket commands with no ticket open (except Ask Kairo Assistant) also carry "only in a ticket" in mono 10.5px. Send and Send and resolve are disabled with an empty composer; Show or hide the ticket list, outside queue views.
- **loading**: While tickets are searched, an 11px spinner sits at the right of the input and the Tickets section shows three skeleton rows.
- **error**: No match: one centered `text.tertiary` line "Nothing matches "…"". Search failed: the Tickets section shows one 12.5px `color.bad-ink` row with Retry; Actions and Go to stay available.

## Accessibility

- `role="dialog"`, `aria-modal="true"` and `aria-label="Command palette"`; the input has a label; closes with esc or a scrim click and returns focus.
- tab switches the scope; ↑ ↓ move the highlight. Every command with a key carries `aria-keyshortcuts`; the keys inside the scope segments are `aria-hidden`.
- ⌘/ and ⌘? always work; ? alone does not while focus is in a text field. Single keys and key sequences (P 1) never fire inside a text field.

## Domain value

An agent at Acme Support finds any command, and learns its key, without leaving the queue.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the dialog takes the width minus 32px and sits 48px from the top.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
