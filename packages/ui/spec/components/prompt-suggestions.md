# prompt-suggestions

## Purpose

Suggests what to ask the AI.

## Variants

- Starter (`.starter`): full-width rows with a 26px icon on `accent.soft`, text and chevron, under "Suggestions". Four in the approved design: summarize the ticket and the customer's sentiment, draft a first response, find similar tickets, ask the knowledge base.
- Follow-up (`.fu`): 28px pills with the 10px spark under a finished answer (make it shorter, back to the full version, draft a first response, group with a similar ticket).

## States

- **default**: As described in Variants.
- **hover**: `accent.line` border, `accent.soft` fill.
- **active**: Pressed: `accent.soft` fill with `accent.line` border while the question is sent, with an 11px spinner in place of the chevron or spark.
- **disabled**: No new follow-ups while the AI is answering.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Real buttons; a group follow-up triggers the action, not a question.

## Domain value

Each suggestion routes to an answer type: summary, draft, short draft, similar tickets, knowledge base.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
