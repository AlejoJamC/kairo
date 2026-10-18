# progress-steps

## Purpose

List of steps of a process that runs on its own.

## Variants

- Wait (public web): 48px brand tile with a pulsing ring; title and subtitle in an `aria-live` region; card list of 42px rows. Done: ok check and "ready"; active: spinner; pending: 6px dot and `text.tertiary`. A primary CTA fades in at the end, with a fallback link below.
- Reasoning (app assistant): compact trigger in mono 11.5px (indicator, label, chevron) and an indented list of steps with a 5px dot, 12px label and mono detail.

## States

- **default**: As described in Variants.
- **hover**: Reasoning trigger: label and chevron turn `text.primary`.
- **active**: Reasoning list open.
- **disabled**: Not applicable.
- **loading**: Reasoning: Thinking… with spinner and accent dots; Writing… with spinner and ok dots; the list stays open while running.
- **error**: Failed step: a `color.bad` dot (reasoning) or a `color.bad-ink` alert icon (wait), label in `color.bad-ink`; later steps stay pending. The wait variant shows Try again (primary).

## Accessibility

- The trigger is a `<button aria-expanded>`; progress text is in a polite live region.

## Domain value

Session handoff to the app; AI reasoning steps (reading the thread, checking similar tickets, writing in brand tone, and others per answer type).

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
