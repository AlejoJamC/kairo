# kairo-character

## Purpose

The symbol with a face: the Kairo assistant. It is the illustration of empty states, onboarding and pages with a message, and the assistant's avatar.

## Variants

- Without limbs: the five layers of the symbol plus the face, in the same colors. Heights 96, 64 and 32px.
- With limbs: arms and legs join the body when the character needs a gesture. Heights 104, 72 and 40px; minimum 40px. Drawn only with the happy face and at rest.
- Expressions (only the face changes; the body does not): happy (closed eyes, open smile), neutral, reading, focused, urgent ("detects urgency"), decision ("asks for your decision") and paused.
- Poses (without limbs): rest; attentive (the I rises and shifts right, the R drops); thinking (the I and R shift left and down, the K turns 5°). Layers move whole, never deformed. Timing and easing between poses: Not defined in the approved design.
- One ink: one silhouette in a single color (`ink`) with the face cut out in the ground color (`ground`): ink on white, white on accent, white on dark. Happy face only, with or without limbs.
- Assistant avatar: a circle on `accent.default` or on `surface.sidebar` with the happy character 68% of the circle tall. Circles of 36, 56 and 96px in the design; the product also uses 24 and 34px.
- The character has no reduced cut; it only scales. Heights below 24px: Not defined in the approved design.
- Never: change the colors, stretch or deform, add outlines or shadows, rotate, put a face on the three-layer cut.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Decorative by default (`aria-hidden`). Pass `label` when the character carries the message alone (role `img`); the expression never replaces text.
- The expression is not announced: the state it shows ("reading", "needs your decision") is always also written next to it.

## Domain value

Empty states, onboarding, the sign-in and not-found pages, the assistant avatar in assistant-turn.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Same artwork; the app has no designed screen yet.
