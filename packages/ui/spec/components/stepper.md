# stepper

## Purpose

Shows where the person is in the onboarding wizard and which steps they have completed. It is a progress indicator, not navigation.

## Variants

- Ordered list of steps at 12.5px, gap 10px, centered in the 60px wizard header. Each step is a 20px circle and a label, gap 8px; steps are joined by 28×1px lines.
- Current step: circle in `accent.default` with the step number in mono 10.5px `text.onAccent`, label 500 in `text.primary`, `aria-current="step"`. Only one step is current.
- Pending step: circle with a 1px inset ring in `border.strong`, number in mono `text.tertiary`, label in `text.tertiary`.
- Completed step: circle in `accent.soft` with a 1px inset ring in `accent.line` and an 11px check (stroke 3) in `accent.ink`; label in `text.secondary`, followed by visually hidden text " (done)".
- Line after a completed step: `accent.line`. Every other line: `border.strong`.
- A step is completed once the person has finished it and moved on: Connect after returning from the provider with the account connected; Detect after the scan finishes and the person opens the queue. Going back with the browser makes that step current and keeps the earlier steps completed.

## States

- **default**: As in Variants.
- **hover**: Not applicable: steps are not links or buttons.
- **active**: The current step, marked with `aria-current="step"`.
- **disabled**: Not applicable: a pending step is not disabled, it is not reached.
- **loading**: Not applicable: scan progress is shown by progress-bar.
- **error**: Not applicable: errors are shown on the page with a callout; the step stays current.

## Accessibility

- `<ol aria-label="Steps">`; the lines are `aria-hidden`.
- The accessible name of a completed step includes its state ("Connect (done)") through visually hidden text; the check icon is `aria-hidden`. State never depends on color alone.
- Below 720px the label is hidden visually only (visually hidden technique), never with `display: none`, so the step name is still announced.
- Contrast: `accent.ink` on `accent.soft`, and `text.secondary` and `text.tertiary` on `surface.page`, meet 4.5:1.

## Domain value

Three steps: Connect, Detect, Done. On the last step the first two are completed and Done is current.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px only the circles and lines are visible; labels remain available to screen readers.
