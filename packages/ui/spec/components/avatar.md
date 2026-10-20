# avatar

## Purpose

Shows a person or a workspace.

## Variants

- Person (`.av`): 28px default, initials 600 in `text.onAccent` on an avatar color. Sizes 16, 20, 24, 26, 32, 34, 38.
- Soft (`.av.soft`): `accent.soft`, `accent.ink`, `accent.line` inset; the customer in a ticket.
- Presence: 8–10px dot with a 2px ring of the background: online ok, away warn, invisible p3.
- Workspace: 56px square, radius card, `text.primary` fill, initial in `surface.page`.
- Invite: 52px workspace tile with the inviter's 26px avatar overlapping the bottom-right corner.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- White initials do not reach 4.5:1 on every avatar color; the full name is always next to the avatar or in `title`.

## Domain value

Agents, teammates in mentions and notes, customers in the thread and clients table.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
