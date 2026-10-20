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
- Collapsed (`.sb.collapsed`, `layout.sidebar-collapsed`): labels (`.lbl`) hidden; the header stacks in a column (brand, bell, expand); search and nav items become centered 30px icon buttons with `title`; language becomes an icon button with the globe that opens a 160px popover with Español / English; account shows only the avatar (40px). Width transition 160ms.

## States

- **default**: Expanded, as described in Variants.
- **hover**: Search, language and account take `surface.hover` with `text.primary`; bell and collapse take `surface.hover` with the icon in `text.primary`.
- **active**: The bell or the account button with its popover open carries `.on` (`surface.hover`); the nav-item of the current view carries `.on`.
- **disabled**: Not applicable.
- **loading**: Nav-item counts are hidden until there is data; the bell shows no count.
- **error**: If the notification count fails, the bell shows no count; no message in the sidebar.

## Accessibility

- `<nav aria-label="Workspace">`.
- Bell: `aria-label="Notifications"`, plus "N unread" when there is a count. Collapse: `aria-label` "Collapse sidebar" / "Expand sidebar" and `aria-expanded`.
- The language select has a visually hidden label "Language". Collapsed search carries `aria-label` "Search or run a command" and `title="⌘K"`.
- Account button: `aria-haspopup="dialog"` and `aria-expanded`.

## Domain value

The agent of Acme Support reaches every queue, the knowledge base, clients and settings from one column, and sees unread activity on the bell.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the sidebar goes full width, always expanded, and the collapse button is hidden.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
