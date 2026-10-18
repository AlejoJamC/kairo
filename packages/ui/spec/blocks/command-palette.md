# command-palette

## Purpose

Search tickets, run actions and navigate (⌘K). Uses the dialog overlay pattern; see dialog for task dialogs.

## Variants

- Scrim; dialog min(600px, 92%) at 110px from the top, radius dialog, `shadow.pop`; 50px input at 15px; sections Tickets, Actions, Go to; 36–38px rows with Kbd; footer with ↵ run first and esc close.

## States

- **default**: As described in Variants.
- **hover**: Row hover.
- **active**: Keyboard-highlighted row.
- **disabled**: Not applicable.
- **loading**: While tickets are searched, an 11px spinner sits at the right of the input and the Tickets section shows three skeleton rows.
- **error**: Search failed: the Tickets section shows one 12.5px `color.bad-ink` row with Retry; Actions and Go to stay available.

## Accessibility

- `role="dialog"` with `aria-label`; input has a label; closes with esc or scrim click.

## Domain value

Actions: Acknowledge (A), Resolve (R), Escalate (E), Write internal note (N), Ask Kairo Assistant (⌘J), switch theme.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
