# knowledge

## Purpose

Knowledge base of the workspace: the articles the assistant can cite.

## Variants

- Shell: sidebar (Knowledge entry `.on`) · page view · status-bar.
- List view (`.page`): knowledge-list, which starts with its page-header (count, description, Add article), the filter-pill toolbar with search, and the article table.
- Editor view (`.page.narrow`): article-editor, opened from a row or from Add article; back to the list with "Knowledge".
- Empty: knowledge-list empty variant with Add article.

## States

- **default**: List view with the All filter.
- **hover**: Not applicable.
- **active**: Editor view open.
- **disabled**: People who are not Owner or Admin see the list without Add article and the editor in read-only mode.
- **loading**: knowledge-list and article-editor in their loading states; the toolbar stays visible.
- **error**: knowledge-list error state with Retry; article-editor save error callout.

## Accessibility

- One `<h1>` per view: the page-header title in the list, the visually hidden title in the editor.

## Domain value

Acme Support publishes its policies once and the assistant cites them in drafts when a ticket asks about them.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the table keeps article and state only and the editor goes to one column.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
