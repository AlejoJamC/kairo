# source-list

## Purpose

Lists where an answer comes from or which tickets are related.

## Variants

- Source row (`.mini`): 22px icon, mono ID, mono meta on the right, 12.5px title. Ticket: ticket icon in `accent.ink` on `accent.soft`, meta in `accent.ink` when it opens. Client: person icon in `text.secondary` on `surface.hover`, does not open.
- Ticket row: priority glyph, mono ID, title, location; similar tickets with a link icon and "same issue".
- Web: stacked similar cases with the similarity in mono ok-ink.

## States

- **default**: Header in the `label` style, shown only when there are rows.
- **hover**: Rows that open: `accent.line` border, `accent.soft` fill.
- **active**: Pressed: `accent.soft` fill with `accent.line` border while the referenced ticket opens.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Rows that open are buttons; others are static.

## Domain value

Assistant sources, client panel other tickets and similar tickets, similar cases on the public web.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
