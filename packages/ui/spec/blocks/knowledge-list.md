# knowledge-list

## Purpose

List of the knowledge base articles that the assistant can cite in its answers and drafts.

## Variants

- page-header with count, description and action: "Knowledge" + total · "Articles Kairo can cite in drafts and assistant answers." · primary button of `size.control-lg` with + "Add article".
- Toolbar: filter-pill tabs All · Published · Drafts · To review (each with its count) · search "Search articles" (title, content and tag).
- List (card with `overflow-x: auto`): header `.arow` in the `label` style without top border (Article · Tags · State · Updated) and one `button.arow` per article (grid `minmax(260px, 2.6fr) minmax(0, 1.4fr) .9fr .8fr`, 12px gap, padding 12px 18px, `border.default` top border, min width 760px):
  - Article: title 13px/500 + the first line of the content in 12.5px `text.tertiary`, both with ellipsis.
  - Tags: up to two static 20px chips and, if there are more, "+N" in mono 11px `text.tertiary`.
  - State (`.state`): "published" with a `color.ok` dot · "draft" with a `border.strong` dot · "to review" with a `color.warn` dot.
  - Updated: mono 12px date in `text.tertiary`.
- A row opens the article in article-editor. Order: last updated first.
- Empty (no articles): instead of the card, the list variant of empty-state inside a dashed `border.strong` container with `radius.card` and padding 56px 24px: "No articles yet" + "Kairo cites published articles when they pass the relevance threshold (0.80). Write the first one." + primary "Add article".
- No results (articles exist, filters do not match): one centered row in 13px `text.tertiary`, padding 40px 18px: "No article matches these filters."

## States

- **default**: All filter.
- **hover**: The row takes `surface.hover`.
- **active**: The current filter `.on`; search filters while typing.
- **disabled**: People who are not Owner or Admin do not see "Add article" and open articles read-only.
- **loading**: Five rows with two `.shim` bars (12px at 50%, 10px at 70%) in the first column.
- **error**: If the list does not load, the card is replaced by "The articles could not be loaded." in 13px `text.tertiary` and a secondary Retry button.

## Accessibility

- The list is a `role="table"`: the header row uses `role="columnheader"` and every row is a `<button>` with `aria-label` "[title], [state], updated [date]".
- The state dot is decorative; the state is text.
- Search has the visually hidden label "Search articles".

## Domain value

Acme Support keeps its refund and access policies as published articles, so the assistant cites them when a customer asks.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the row becomes `minmax(0, 1fr) auto` (article and state); tags and date are hidden.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
