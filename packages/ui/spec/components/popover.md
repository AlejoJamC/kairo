# popover

## Purpose

Floating surface for menus and small anchored dialogs; the base of every menu of the app.

## Variants

- Popover (`.pop`): `surface.panel`, `border.default`, radius card, `shadow.pop`, absolutely positioned. Padding 6px; rows are menu items (see menu); sections with a `label` header and `border.default` dividers; the destructive action last, in `color.bad-ink`, after a divider.
- Uses, each defined in its own spec:
  - Status menu, 210px: status-chip.
  - Priority menu, 170px: ticket-heading.
  - Correct the classification, 290px: reclassify-popover.
  - Activity, 380px: notification-row.
  - Account, 270px: account-menu.
  - Mention, 300px: mention-menu.
  - Person options, 200px: member-row.
  - More send options, 220px: button (split send).
  - Language with the sidebar collapsed, 160px: sidebar.

## States

- **default**: Closed; the trigger carries `aria-expanded="false"`.
- **hover**: Menu item takes `surface.hover` with `text.primary`.
- **active**: Open; the current option `.on` and the keyboard-highlighted one `.hl`.
- **disabled**: An unavailable option in `text.tertiary` at opacity 0.6, no hover, `aria-disabled="true"`.
- **loading**: When the content comes from the server, one row with a spinner and "Loading…" in `text.tertiary`.
- **error**: One row in 12.5px `text.tertiary` with the problem ("Could not be loaded."); the popover does not close by itself.

## Accessibility

- Menus: `role="menu"` with `menuitem` (or `menuitemradio` with `aria-checked` when there is a current option). Anchored dialogs: `role="dialog"` with `aria-label` or `aria-labelledby`.
- The trigger carries `aria-haspopup` and `aria-expanded`. On open, focus goes to the current or first option; ↑ ↓ move, ↵ chooses, esc or an outside click closes it and returns focus to the trigger.
- Only one popover is open at a time.

## Domain value

Classification correction lets the agent fix the AI; every correction teaches Triage. Status, priority, account and mentions are changed in place without leaving the ticket.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the width is capped at the available width minus 20px and the popover repositions to stay inside the window.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
