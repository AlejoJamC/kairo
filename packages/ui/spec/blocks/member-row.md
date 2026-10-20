# member-row

## Purpose

One person of the team in Settings › Team.

## Variants

- Row (`.setrow.member`): grid `minmax(0, 2fr) 1fr 1fr 28px`, 12px gap, padding 14px 18px, `border.default` divider between rows, inside a card.
  1. Person: 34px avatar with a 10px presence dot (2px border in `surface.panel`; `color.ok` online, `color.warn` away) · name 500 with ellipsis · mono 11.5px email in `text.tertiary` with ellipsis.
  2. Role: static chip: Owner, Admin, Agent.
  3. State (`.state`): 6px dot + mono 12px word in `text.tertiary`: "active" (`color.ok`) or "away" (`color.warn`).
  4. Options: icon button with three dots. Opens a 200px popover with "Change role" (submenu with the three roles, `.on` on the current one) and, last and after a `border.default` divider, "Remove from workspace" in `color.bad-ink`.
- Above the list: the page-header of Team ("Team", "3 / 5 seats used on the Pro plan.", "Invite") and the seats bar: 6px on `surface.hover`, `radius.pill`, `accent.default` fill proportional to the seats used (the bar of progress-bar, without legend).
- You: the name carries "(you)" in `text.tertiary`; no "Remove from workspace".
- Pending invitation: no presence dot; the state reads "invited" with a `border.strong` dot; options are "Resend invitation" and "Cancel invitation" (`color.bad-ink`).

## States

- **default**: As described in Variants.
- **hover**: The row does not change; the icon button takes `surface.hover`.
- **active**: With the menu open, the icon button carries `.on`.
- **disabled**: People who are not Owner or Admin see the row without the icon button.
- **loading**: Four rows with a 34px circle and two `.shim` bars (12px at 40%, 10px at 30%).
- **error**: If a role change fails, the chip returns to the previous role and a toast explains it. "Remove from workspace" asks for confirmation inside the menu ("Remove [Name]?" + "Remove" in `color.bad-ink`) before acting.

## Accessibility

- The list is a `role="table"` with visually hidden headers (Person, Role, State, Options).
- The presence dot is decorative; the state is text in the third column, and below `layout.breakpoint` it moves to the avatar `title`.
- The icon button carries `aria-label` "Options for [Name]" and `aria-haspopup="menu"`.
- The seats bar is `role="progressbar"` with `aria-valuetext` "3 of 5 seats".

## Domain value

The Owner of Acme sees owner@acme.com active and agent@acme.com away, and invites invite@acme.com as an Agent.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint`, grid `minmax(0, 1fr) auto 28px`: the state column is hidden.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
