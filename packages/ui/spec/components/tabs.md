# tabs

## Purpose

Switches panels inside the context panel of a ticket.

## Variants

- Tab list (`role="tablist"`, `aria-label="Context"`): 18px gap, padding 7px 18px 0, `border.default` bottom border. Each tab is `button.tab`, `size.tab` high, 13px/500 in `text.tertiary`; the active tab in `text.primary` with a 2px `accent.default` underline.
- Four fixed tabs, in this order, with their key: Client ⌘1 · Assistant ⌘2 · Notes ⌘3 · Escalate ⌘4. Four is what fits in `layout.context`; no tab is added: similar tickets are a section of Client ("Similar tickets") and articles are the sources Assistant cites, inside that tab.
- Assistant: 6px `accent.default` dot before the label (AI tab).
- Notes: a count badge "1" when the ticket has an unread mention; otherwise a mono `.cnt` with the total of notes. Never both.
- On desktop the tab row is a drag area (see window-chrome); the tabs keep responding to clicks.

## States

- **default**: Inactive tabs in `text.tertiary`.
- **hover**: `text.primary`; the tooltip shows the name and the key ("Assistant ⌘2").
- **active**: The current tab in `text.primary` with the accent underline and `aria-selected="true"`. Opening Notes marks the mention of the ticket as read.
- **disabled**: Not applicable: with no ticket selected the panel shows its empty state and the tabs are not shown.
- **loading**: Not applicable: switching tabs is immediate.
- **error**: Not applicable: each panel reports its own errors.

## Accessibility

- `role="tab"` inside `role="tablist"`. Each tab carries `aria-keyshortcuts` ("Meta+1" to "Meta+4") and its tooltip carries the key.
- ⌘1 to ⌘4 work with a ticket open, without focus on the tabs. With focus on them, ← → move between tabs.
- The Assistant dot is decorative; the badge carries visually hidden text "unread mention".

## Domain value

Client, Assistant, Notes, Escalate.

## Platforms

- **web**: Triage app in the browser. ⌘ is Ctrl on Windows and Linux.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
