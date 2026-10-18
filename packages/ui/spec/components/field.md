# field

## Purpose

Text input, select or textarea with its label.

## Variants

- App: 36px, `surface.sunken`, `border.default`, radius field, 13px; label above in the `label` style.
- Web (`.field.md`): 40px, 14px, padding 8×11; label in `.flabel` (12.5px/500, `text.primary`).
- With unit: input inside the field container, unit in mono `text.tertiary` (min).
- Range: native range with accent color, current value in mono 18px `accent.ink`, ends explained in mono 11px.

## States

- **default**: As described in Variants. Placeholder in `text.tertiary`.
- **hover**: `border.strong` border.
- **active**: Focus: `accent.line` border and a 3px `accent.soft` halo.
- **disabled**: Read-only: `surface.hover` fill, `text.secondary`.
- **loading**: Asynchronous check (for example URL availability): an 11px spinner inside the field on the right.
- **error**: Errors appear in a bad callout under the form with `role="alert"`.

## Accessibility

- Every input has a `<label>`; hidden labels use `.sr`.
- Requirements and hints are linked with `aria-describedby`.

## Domain value

Workspace name, URL and timezone; SLA minutes per priority; auto-resolution confidence threshold; login, invite and password fields.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
