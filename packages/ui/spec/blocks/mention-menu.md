# mention-menu

## Purpose

Mentions inside an internal note: the menu that opens when typing @ in the composer, and the chip of each mentioned person.

## Variants

- Menu: 300px popover anchored 20px from the left edge of the composer, opening upward.
  - Header (`.mmenu-head`, `surface.sunken`, `border.default` bottom border): `label` header 9.5px "MENTION" · the query in mono 10.5px `accent.ink` ("@ad") · flexible space · "2 of 3" in mono 10px `text.tertiary`.
  - List (padding 4px, max height 240px with scroll): 40px menu items with a 9px gap: 24px avatar · name 12.5px/500 in `text.primary` · role in mono 10.5px `text.tertiary` below. The first match carries `.hl`.
  - Footer (`.mmenu-foot`, `surface.sunken`, `border.default` top border): kbd ↵ "insert" · kbd esc "close".
- No matches: the list shows "No teammates match" centered in 12.5px `text.tertiary`, padding 18px 12px; the footer stays.
- Mention chip (`.mention`, 22px, `radius.pill`): `mentions.chipBackground` over `surface.panel` with `mentions.chipBorder` inset, text 11.5px/500 in `mentions.chipText`; 16px avatar · "@Name" · 16px × button. Chips sit in the note row of the composer, after the team-only badge and before the hint "Type @ to mention a teammate".
- In the note text the mention stays as "@Name" and is drawn with the mention mark of rich-text once posted.

## States

- **default**: Closed. Opens when @ is typed at the end of a word; filters by name and role while typing.
- **hover**: Item takes `surface.hover` with `text.primary` (as menu).
- **active**: The highlighted item carries `.hl`; ↑ ↓ move it. ↵ or a click inserts it: the text becomes "@Name " and its chip is added (once per person). esc closes without inserting. The chip × removes the chip and the mention from the text; on hover the × takes `mentions.chipBackground`.
- **disabled**: Not applicable: the menu does not exist in Reply mode.
- **loading**: While the team list loads, one item with `.spin` and "Searching…" in `text.tertiary`.
- **error**: If the list does not load, "The team could not be loaded." replaces the items; @ stays as plain text.

## Accessibility

- The menu is `role="listbox"` with `aria-label="Mention"`; each item is `role="option"` with `aria-selected` on the highlighted one. The textarea carries `aria-controls` to the menu and `aria-activedescendant` to the highlighted item, so focus never leaves the text.
- The chip × carries `aria-label` "Remove Name".
- Chip contrast: `mentions.chipText` on `mentions.chipBackground` over `surface.panel` is 4.64:1, also inside the note-mode composer on `notes.background`.

## Domain value

The agent writes an internal note on an Acme ticket, types @ad and mentions the Admin, who gets notified; the customer never sees it.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the menu takes the composer width minus 40px, up to 300px.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
