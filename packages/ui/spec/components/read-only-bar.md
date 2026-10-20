# read-only-bar

## Purpose

Takes the place of the composer at the foot of a ticket in a final status and says why nothing can be written.

## Variants

- Bar (`.robar`): full width of the ticket pane, no radius, `border.default` top border, `surface.sunken`, padding 14px 20px. Centered content with a 10px gap: 13px lock icon (stroke 2) · "This ticket is resolved. It is shown in read-only mode." in 12.5px `text.tertiary`.
- The only piece that replaces the composer. It is not a callout: no box and no radius.
- On the same screen, ticket-bar shows the "Read only" chip, ticket-heading uses its read-only variant, evidence-panel shows no row actions and escalate-panel hides its form.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: While the ticket loads, neither the composer nor this bar is shown.
- **error**: If the ticket status could not be loaded, the composer is not shown and the bar says "The ticket status could not be loaded." with the same lock.

## Accessibility

- `<div role="status">`: screen readers announce the text when the ticket opens.
- The lock is decorative (`aria-hidden`); the text states the reason.
- Focus does not enter the bar; Tab moves on to the context panel.
- `text.tertiary` on `surface.sunken` is 4.98:1.

## Domain value

When the agent opens a resolved ticket from Acme, the foot of the ticket explains why there is no composer.

## Platforms

- **web**: Triage app in the browser, text limited to `layout.reading`. Below `layout.breakpoint`, padding 14px 16px and the text may wrap.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
