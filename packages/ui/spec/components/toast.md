# toast

## Purpose

Short confirmation after an action.

## Variants

- Inverted surface (`surface.inverse`), radius input, `shadow.pop`, centered 16px from the top. Check in `color.inverse-ok`, text in `text.inverse`, optional Undo in `color.inverse-link`, close in `color.inverse-faint`.

## States

- **default**: Single line; replaced by the next toast; dismisses itself.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Error toast: same inverse surface; the check is replaced by an alert icon in `color.bad`, with an optional Retry in `color.inverse-link`.

## Accessibility

- `role="status"`; close button with `aria-label`.

## Domain value

Confirms resolve, insert draft, copy and export.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
