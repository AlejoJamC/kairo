# kairo-mark

## Purpose

The Kairo symbol: five flat layers, one per letter of KAIRO, always stacked in the same order. It is the brand in the interface, the favicon and the app icon.

## Variants

- Five layers (color): stacked back to front I, O, K, A, R. Fixed brand artwork, never themed: K `#F97316`, A `#FFCE2B`, I the same yellow lightened to 62% (`#FFE17C`), O `#7C5CFF`, R the same violet lightened to 60% (`#B09DFF`).
- Three-layer cut: O, K and A only, drawn with the same paths. For heights where five layers blur.
- Size is the symbol height; the width is 1.124 times the height. Five layers from 32px tall, the cut below it, down to 16px. `layers="auto"` applies that rule; `3` or `5` force a version.
- One ink: the layers merge into one silhouette in a single color (`ink`): the text color (`currentColor`), `accent.default`, or white on the accent and on dark. It always draws the full silhouette, at any size.
- Backgrounds: white, light gray, accent and dark. The colored symbol is the same on all of them.
- Plates, in static files only: app icon on `accent.default`, light (white with a 1px `border.default` inset) and dark (`#0C0C0E`), corner radius 22.5% of the side, symbol 74% of the side wide. Favicon 16px uses the cut and 32px the five layers; the dark favicon is a 32px dark plate with the cut; apple-touch is 180px, a full-bleed accent square that iOS rounds. macOS is a white plate of 824 in a 1024 canvas with a soft shadow; Windows has no plate and draws the symbol directly; iOS and Android use the accent plate with the symbol on its own layer. `bun run brand:assets` writes the web and desktop files from this component; the mobile files follow the same rules when the app has its own build.
- Never: change the colors, stretch or deform, add outlines or shadows, rotate.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Decorative by default (`aria-hidden`). Pass `label` when the symbol alone names the brand (role `img`).
- When it sits inside a link or button, the control gets its name from visible text or its own label, never from the symbol.

## Domain value

Brand of the product: sidebar header, auth and wizard headers, favicons, app icons.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Same artwork; the app has no designed screen yet.
