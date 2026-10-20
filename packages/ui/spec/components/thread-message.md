# thread-message

## Purpose

One message in the ticket thread.

## Variants

- Initial customer message: soft avatar, name, "initial message" tag, mono meta; body 14/1.65 in a bordered `surface.panel` box, 44px indent.
- Agent reply: color avatar, "reply · sent" tag, bubble on `accent.soft`.
- Internal note: team-only badge, bubble on `notes.background` in `notes.text`.

## States

- **default**: New messages fade in.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Missing body: dashed `border.strong` box with the explanation in `text.tertiary`.

## Accessibility

- Messages are an `<article>`; author and time are text.

## Domain value

Customer messages, sent replies and internal notes in one thread.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
