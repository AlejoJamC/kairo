# assistant-turn

## Purpose

Kairo Assistant conversation in the context panel.

## Variants

- Empty: 34px accent tile with `shadow.glow`, name, "Agent copilot · knows this ticket", intro and starter suggestions.
- User turn: bubble on the right on `surface.hover`, max 86%.
- AI turn: reasoning steps, answer in rich text, draft card (draft answers), source list and follow-ups; the last three appear when the answer finishes.
- Answer types: summary, draft, short draft, similar tickets, knowledge base. Free questions are routed to one of them.

## States

- **default**: Empty state.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Thinking: steps open, spinner, accent dots. Writing: spinner, ok dots, text with caret. Done: steps collapse to "Reasoned · N steps". Stopped: the answer completes at once.
- **error**: Answer failed: the reasoning step that failed gets a `color.bad` dot, and the turn shows a bad callout (`role="alert"`) with Retry (secondary sm). The question stays in the conversation.

## Accessibility

- Steps trigger is a button with `aria-expanded`; new blocks fade in.

## Domain value

A copilot with the thread, the customer history and similar tickets as context.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
