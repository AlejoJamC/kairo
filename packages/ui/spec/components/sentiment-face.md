# sentiment-face

## Purpose

Shows the customer's sentiment.

## Variants

- Vector: 14px face, stroke 1.4, 16 viewBox. Aggressive: mouth down with two angled brows (`M5 5.2l2 1M11 5.2l-2 1`) in `sentiment.aggressive`; frustrated: mouth down in `sentiment.frustrated`; neutral: flat in `sentiment.neutral`; positive: up in `sentiment.positive`.
- Emoji: 😡 aggressive, 😠 frustrated, 😐 neutral, 🙂 positive, in a 14×14 box at 13px with the emoji font family.
- Text: the word in 12px `text.secondary`, no state color.

## States

- **default**: As described in Variants. One variant is shown at a time. No value: nothing is rendered.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- All variants share the accessible name "Sentiment: frustrated".

## Domain value

TicketTone aggressive, frustrated, neutral and positive, from the `sentiment` scale.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
