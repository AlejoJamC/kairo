# auth-handoff

## Purpose

Transition from sign-in to the app.

## Variants

- Progress steps, wait variant: verifying your session, preparing your workspace, opening Triage or the desktop app. Destinations: web and desktop.

## States

- **default**: Done: CTA Go to Triage or Open Kairo.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Steps in progress.
- **error**: A step fails: progress steps error state, title "We could not open your session", Try again (primary) and Back to sign in (secondary).

## Accessibility

- Progress in a polite live region.

## Domain value

Hands the session to the browser app or the desktop app.

## Platforms

- **web**: Public web (no session).
- **desktop**: Opens the desktop app when the destination is desktop.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
