# note-card

## Purpose

One internal note.

## Variants

- Card on `notes.background` with `notes.border` inset: 20px avatar, author in `notes.text`, mono time in `notes.label`, body 12.5/1.55 with mention marks.
- Unread mention (`.unread`): `notes.label` ring and a 3px accent inset on the left; "Mentioned you" badge.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- The privacy notice is always shown below the list.

## Domain value

Internal notes are never sent to or visible to the customer.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
