# ask-box

## Purpose

Input to ask the AI, fixed at the bottom of the assistant panel.

## Variants

- Card with context chips (active ticket, customer, dashed @ Context), 2-row textarea, model selector, "active ticket context" hint and a 30px button.

## States

- **default**: Empty: button on `surface.hover`, arrow in `text.tertiary`.
- **hover**: Context chips take `border.strong`; the send button with text drops to brightness 0.93.
- **active**: With text: button on `accent.default`, white arrow.
- **disabled**: Empty input disables the button.
- **loading**: Answering: Stop button (12px square on `surface.hover`); no new question can be sent.
- **error**: Question not sent: a 12px `color.bad-ink` line with a Retry link appears above the textarea; the text is kept.

## Accessibility

- Textarea with a label; ↵ sends, ⇧↵ adds a line.

## Domain value

Questions are scoped to the active ticket.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
