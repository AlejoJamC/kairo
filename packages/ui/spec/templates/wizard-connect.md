# wizard-connect

## Purpose

Onboarding step 1: connect the support inbox.

## Variants

- Wizard header with stepper; channel choice cards; intent segmented (Support, Sales, Both); permission list; Continue with Google (lg); preview aside on `surface.sidebar` with a product frame of example rows.

## States

- **default**: Gmail selected, intent Support, drafts off.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Coming-soon channels.
- **loading**: Not applicable.
- **error**: Permission denied by Google: a bad callout above the CTA explains it and the CTA reads Continue with Google again.

## Accessibility

- Channel cards in a fieldset with a legend; intent uses `aria-pressed`.

## Domain value

Read-only by default; the user can disconnect at any time.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. The preview aside hides below 980px.
