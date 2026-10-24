# sidebar

## Purpose

First column of the app shell: brand, notifications, search, navigation, language and account.

## Variants

- Expanded (`.sb`): `layout.sidebar` wide on `surface.sidebar`, `border.default` right border, padding 12px 10px, 14px gap. Top to bottom: header, search, navigation, flexible space, footer.
- Header (`.sb-head`): 24px brand tile (`.mark`, `accent.default`, `radius.sm`, white bolt) · "Kairo" 14px/600 · flexible space · bell icon button (`.ibtn.bell`) · collapse icon button.
- Bell: `.bell-count` with the total unread (notifications plus mentions), 15px pill on `color.bad`, mono 9px/600 in `text.onAccent`, 2px ring in `surface.sidebar`. With an unread mention, also `.bell-mention`: 7px dot in `mentions.unreadDot` at the bottom right. Opens the activity popover of notification-row (380px, 46px from the top).
- Search (`.nav.sb-box.sb-search`): `surface.panel`, `border.default`, `shadow.xs`; 14px magnifier, "Search or run a command…" 12.5px in `text.tertiary`, kbd ⌘K. Opens command-palette.
- Navigation: two groups of nav-item with a 2px gap, separated by `.sb-div` (1px `border.default`, 6px side margin). Group 1: Triage, Awaiting customer, Resolved, Escalated, AI Classification, Knowledge. Group 2: Clients, Settings.
- Footer (6px gap): language select (`.sb-lang`, `size.control`, globe icon + native select, Español / English) and account button (`.nav.sb-box.sb-acct`, 40px): 24px avatar with an 8px presence dot, workspace name 12.5px/500 with ellipsis, up chevron in `text.tertiary`. Opens account-menu.
- Collapsed (`.sb.collapsed`, `layout.sidebar-collapsed`): labels (`.lbl`) hidden; the header stacks in a column (brand, bell, expand); search and nav items become centered 30px icon buttons with a tooltip; language becomes an icon button with the globe that opens a 160px popover with Español / English; account shows only the avatar (40px). Width transition 160ms.
- Collapsed language: the globe always opens the 160px popover with Español / English (`menuitemradio`, the current one `.on`). A click never switches the language of the whole interface without showing the options; the popover shows the active one and holds more languages without changing the piece.
- Desktop (`.sb.desk`, macOS), with the reserved corner of window-chrome:
  - Window row (`.win-row`, 44px, drag area, no top padding on the sidebar): the system controls 14px from the left edge and, expanded, in the same row: brand · "Kairo" · bell. There is no separate `.sb-head`: the row is the header.
  - Collapse / expand moves from the header to the footer, next to the language, in both states: 30px icon button with the panel icon, tooltip "Collapse sidebar ⌃⌘S" (or "Expand sidebar ⌃⌘S") and `aria-keyshortcuts="Control+Meta+S"`. Expanded, to the right of the language select; collapsed, below the globe and above the account.
  - Search label: "Search or run…"; `aria-label` and tooltip carry "Search or run a command · ⌘K".
  - Collapsed: the window row is 60px wide and takes the background of the neighboring column; the sidebar has no right border of its own and `.sb-edge` draws it from 44px. Below the row, stacked: brand and bell. The rail holds search, the eight views with a tooltip (name and count), a dot on Triage when it has tickets (see nav-item), the globe with the 160px language popover (opening to the right of the globe, aligned to its bottom) and the avatar.
  - Activity popover: 48px from the top edge with the sidebar expanded and 92px collapsed, 10px from the left.
  - The bell count is also the counter of dock-badge.

## States

- **default**: Expanded, as described in Variants.
- **hover**: Search, language and account take `surface.hover` with `text.primary`; bell and collapse take `surface.hover` with the icon in `text.primary`.
- **active**: The bell or the account button with its popover open carries `.on` (`surface.hover`); the nav-item of the current view carries `.on`.
- **disabled**: Not applicable.
- **loading**: Nav-item counts are hidden until there is data; the bell shows no count.
- **error**: If the notification count fails, the bell shows no count; no message in the sidebar.

## Accessibility

- `<nav aria-label="Workspace">`.
- Bell: `aria-label="Notifications"`, plus "N unread" when there is a count. Collapse: `aria-label` "Collapse sidebar" / "Expand sidebar", `aria-expanded` and, on desktop, `aria-keyshortcuts="Control+Meta+S"`.
- The language select has a visually hidden label "Language". Collapsed search carries `aria-label` "Search or run a command" and its tooltip carries ⌘K.
- Account button: `aria-haspopup="dialog"` and `aria-expanded`.

## Domain value

The agent of Acme Support reaches every queue, the knowledge base, clients and settings from one column, and sees unread activity on the bell.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the sidebar goes full width, always expanded, and the collapse button is hidden.
- **desktop**: Triage desktop app. macOS uses the desktop variant; Windows and Linux, with the native frame, use the web layout.
- **mobile**: Not designed.
