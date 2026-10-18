# confidence-ring

## Purpose

Shows the AI confidence for a decision.

## Variants

- Graphic: 16px ring (14px in chips and evidence rows), `border.strong` track and an arc proportional to the value from 12 o'clock: > 0.90 ok, 0.70–0.90 warn, < 0.70 bad. No value: dotted p3 circle.
- Graphic with value: the number next to the ring.
- Numeric: the number only, mono 11px, tabular figures, two decimals, `text.secondary`, right-aligned in a 28px min slot; no value shown as — in `text.tertiary`.

## States

- **default**: As described in Variants. One variant is shown at a time.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Both variants share the accessible name "Confidence 0.73" or "Confidence no data". Graphic: `role="img"`, `aria-label` and `title`. Numeric: "Confidence" prefix in `.sr`.

## Domain value

Confidence of the classification in the queue row, the evidence panel and the AI proposal.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
