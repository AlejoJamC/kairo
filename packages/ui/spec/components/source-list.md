# source-list

## Purpose

Lists where an answer comes from or which tickets are related.

## Variants

- Row (`.mini`): `border.default`, `radius.field`, padding 9px 10px, 10px gap, 12.5px, `surface.panel`. Rows stack with a 6px gap under a `label` header.
- Source row (assistant-turn): 22px icon with 6px radius, mono ID, mono meta on the right, 12.5px title with ellipsis below. Ticket: ticket icon in `accent.ink` on `accent.soft`, meta in `accent.ink` when it opens ("same issue") and in `text.tertiary` when it does not ("current thread"). Client: person icon in `text.secondary` on `surface.hover`, title "[Client] · N tickets", meta "draft" or —; does not open.
- Compact ticket row ("Other tickets" of client-panel), one line: 12px priority-glyph · mono 11.5px ID in `text.tertiary` · subject 12.5px with ellipsis (flex 1) · mono 11px location in `text.tertiary` on the right: the age ("153d") when open, "awaiting" or "resolved".
- Similar ticket row ("Similar tickets" of client-panel), one line: 12px link icon in `accent.ink` · mono 11.5px ID in `text.tertiary` · subject with ellipsis · "same issue" in mono 11px `accent.ink`.
- Web: stacked similar cases with the similarity in mono `color.ok-ink` ("0.91") instead of "same issue".
- Headers: "SOURCES · N", "OTHER TICKETS", "SIMILAR TICKETS"; shown only when there are rows.

## States

- **default**: As described in Variants.
- **hover**: Rows that open: `accent.line` border, `accent.soft` fill. The client row does not change.
- **active**: Pressed: `accent.soft` fill with `accent.line` border while the referenced ticket opens in its queue (Triage, Awaiting customer or Resolved), without changing the panel tab.
- **disabled**: Not applicable: a row that does not open is a `<div>`, not a disabled button.
- **loading**: Two 36px rows with a `.shim` bar of 10px at 60%.
- **error**: If the list could not be loaded, neither the header nor the rows are shown.

## Accessibility

- Rows that open are buttons with `aria-label` "[ID] [subject], [location]"; others are static.
- Glyph, link icon and dots are decorative; the location and "same issue" are text.
- The header is a section heading (`role="heading" aria-level="3"`).

## Domain value

Assistant sources, client-panel other tickets and similar tickets, similar cases on the public web. For Acme, the agent opens the other ticket from support@acme.com that is awaiting a reply.

## Platforms

- **web**: Triage app in the browser and the public web. Below `layout.breakpoint`, full width.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: Not designed.
