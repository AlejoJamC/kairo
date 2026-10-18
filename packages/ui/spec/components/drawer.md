# drawer

## Purpose

Side panel that slides over the page to show secondary detail without leaving the current view. Ships as the history drawer and the contact drawer.

## Variants

- Base: right-side panel, width `layout.context` (344px), full height, on `surface.panel` with a `border.default` left border and `shadow.pop`, over a `surface.scrim` overlay. Header of `size.header` (56px) with the title in the `pane-title` style and a close icon button; scrollable body with 18px padding; optional footer with a `border.default` top border.
- History: chronological list of ticket events (replies, notes, status changes); each row shows the event text in 13px and the time in mono 11px `text.tertiary`, separated by `border.default` dividers.
- Contact: 38px avatar, name, email (example: Acme, support@acme.com), prop rows for plan, tickets and since, and the contact actions in the footer.

## States

- **default**: Open, entered from the right in 160ms; no slide with `prefers-reduced-motion`.
- **hover**: Rows that open something: `surface.hover`.
- **active**: The trigger stays in its active style while the drawer is open.
- **disabled**: Not applicable.
- **loading**: Skeleton rows in the body.
- **error**: A bad callout in the body with `role="alert"` and a Retry secondary button. Empty content uses the empty-state component.

## Accessibility

- `role="dialog"`, `aria-modal="true"` and `aria-labelledby` pointing to the title.
- Focus moves to the drawer on open, is trapped inside and returns to the trigger on close.
- esc, the close button and a scrim click close it; the close button carries `aria-label="Close"`.

## Domain value

Shows the full history of a ticket or the contact behind it while the queue and the ticket stay in place.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the drawer takes the full width.
