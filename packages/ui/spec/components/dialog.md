# dialog

## Purpose

Modal surface for a focused task that blocks the page until it is completed or cancelled. Ships as the classification correction dialog and the client form.

## Variants

- Base: `surface.scrim` overlay; panel on `surface.panel` with `border.default`, `radius.dialog` and `shadow.pop`, centered, max width 480px. Header 16px 20px with the title in the `pane-title` style and a close icon button; body 20px; footer 12px 20px on `surface.sunken` with a `border.default` top border and right-aligned actions.
- Correction: title "Correct the classification", explanation in 12px `text.tertiary` ("Pick the labels that fit. Triage learns from every correction."), type and category chips as buttons (`.on` when chosen), footer with Cancel (ghost) and Save correction (primary sm).
- Client form: app fields (36px) with labels for name, email and company (example: Acme, support@acme.com), footer with Cancel (secondary) and Save (primary).

## States

- **default**: Open, focus on the first field or the first chip.
- **hover**: Button and chip hovers as in their components.
- **active**: Focused field: `accent.line` border and `accent.soft` halo. Chosen chip: chip `.on`.
- **disabled**: Save is disabled until the form is valid or the selection changed.
- **loading**: Save shows a 12px spinner and is disabled; fields become read-only.
- **error**: A bad callout at the top of the body with `role="alert"`; a field error is 12px `color.bad-ink` text under the field, linked with `aria-describedby`.

## Accessibility

- `role="dialog"`, `aria-modal="true"` and `aria-labelledby` pointing to the title.
- Focus is trapped inside while open and returns to the trigger on close.
- esc and the close button close it; a scrim click closes it only when there are no unsaved changes.
- The close button carries `aria-label="Close"`.

## Domain value

Every classification correction teaches Triage; the client form creates or edits a customer record.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the panel takes the full width minus 16px margins.
