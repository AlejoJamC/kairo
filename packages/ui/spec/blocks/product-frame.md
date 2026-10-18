# product-frame

## Purpose

Shows the real app inside a frame on the public web.

## Variants

- Frame: radius frame, `border.default`, `shadow.frame`. Top bar 40px on `surface.sidebar` with three dots and a mono route pill. Content: real app components at 1:1 with invented data.
- Compact: 6–8px padding with a short list of queue rows (wizard).

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `<figure role="img">` with an `aria-label` describing the view.

## Domain value

Never an illustration: the product is shown as it is.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 980px the mock grid collapses to one column and side panels hide.
