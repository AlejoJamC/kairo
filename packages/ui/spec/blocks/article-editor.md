# article-editor

## Purpose

Writes or edits one knowledge base article.

## Variants

- Page view `.page.narrow` opened from knowledge-list.
- Top bar (flex, 8px gap): ghost button with a left arrow + "Knowledge" (back to the list) · flexible space · Discard (secondary, `size.control-lg`) · Save (primary, `size.control-lg`).
- Body (grid `minmax(0, 1fr) 280px`, 24px gap):
  - Main column (12px gap): title in `.field.title` (20/1.3/600, placeholder "Article title") · content in `textarea.field.body` (14/1.65, 16 rows, grows with the text, placeholder "Write the content. Kairo uses it as a source when answering.").
  - Side column: a card with padding 4px 16px and prop-row entries: Published (switch; off means draft and Kairo does not cite it) · Review: "to review" (`color.warn` dot) or "reviewed" (`color.ok` dot) with `.state`; when to review, a secondary button of `size.control-sm` "Mark as reviewed" below · Tags: removable chips and a `size.control-sm` field "Add tag" (↵ adds) · Updated: mono date in `text.tertiary`. Under the card, a neutral callout: "Kairo cites an article only when it is published and relevant to the ticket (threshold 0.80)."
- Blank: empty title and content, Published off, no Review and no Updated.
- Existing: with its values.
- Read only (not Owner or Admin): fields read-only, switch disabled, no Discard and no Save.

## States

- **default**: As described in Variants.
- **hover**: Only the controls.
- **active**: Focused fields as in field.
- **disabled**: Save is disabled while there are no changes or the title or content is missing.
- **loading**: On open, `.shim` in the title (24px at 50%) and in the content (five 12px bars); on save, Save shows `.spin`.
- **error**: If saving fails, a bad callout with `role="alert"` above the body ("The article could not be saved. Try again."). On success, a toast says "Article saved" and the view returns to the list. Leaving with unsaved changes asks in a popover anchored to "Knowledge": "Discard the changes?" + "Discard" in `color.bad-ink`.

## Accessibility

- A visually hidden `<h1>` "Edit article" or "Add article"; the title field carries `aria-label` "Article title".
- Every property has its label; the switch is `role="switch"` with `aria-checked` and `aria-label="Published"`.
- ⌘↵ saves; esc does not leave the editor.

## Domain value

An Acme Admin writes the refund policy, tags it billing, publishes it, and from then on the assistant can cite it.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint`, one column: the properties card goes under the content.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
