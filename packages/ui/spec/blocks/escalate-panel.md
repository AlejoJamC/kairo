# escalate-panel

## Purpose

Escalate tab of the context panel: the signals that justify escalating the ticket and the form to do it.

## Variants

- Column with a 14px gap and 18px padding.
- Summary (internal callout: `notes.background` with `notes.border` inset, `radius.row`, padding 12px, 4px gap): headline 12.5px/600 in `notes.label` with the active signals joined by "·" ("P1 · SLA overdue 153d · frustrated") · explanation 12/1.5 in `text.secondary`: "Signals detected on this ticket. Consider escalating to a senior." The headline includes the priority always, the SLA when it is at risk, close to escalation or overdue, and the sentiment when it is frustrated.
- Signal list (`.sigs`: `border.default`, `radius.input`): four rows `.sig` (padding 9px 12px, 12.5px, `border.default` divider between rows, none after the last): 7px indicator dot · name in `text.secondary` · mono 11.5px value in `text.primary`.
  - Priority: P1 / P2 / P3; dot `priority.P1`, `priority.P2`, `priority.P3`.
  - SLA: "overdue 153d", "at risk · 40m", "escalating · 12m", "on time · 2h 10m" or —; dot `sla.overdueBar`, `sla.atRisk`, `sla.escalation`, `sla.onTime`; with no SLA, `border.strong`.
  - Sentiment: frustrated / neutral / positive; dot `sentiment.frustrated` when frustrated, otherwise `border.strong`.
  - Confidence: 0.73 or —; dot in the confidence-ring band (`color.ok`, `color.warn`, `color.bad`); no value `color.p3`.
- Form (6px gap per field): "Escalate to" (`label` style) + select field with the people who can receive escalations (Owner and Admin), as "[Name] · Admin" · "Reason" (`label` style) + 3-row textarea field with the placeholder "What does the next person need to know?" · full-width secondary button, `size.control-lg`, centered: escalate arrow in `status.escalated` + "Escalate [ID]" · mono 11px note in `text.tertiary`: "Alerts the on-call senior by SMS."
- Not escalated: summary, signals and form.
- Escalated: summary and signals; in place of the form, a box with `border.default`, `radius.row`, padding 10px 12px: 13px arrow in `status.escalated` + "This ticket is escalated." in 12.5px `text.secondary`.
- Read only (final status): summary and signals; no form and no box.

## States

- **default**: "Escalate to" holds the first available person; "Reason" is empty.
- **hover**: The button as the secondary button; fields do not change on hover.
- **active**: Focused fields take the `accent.line` border and `accent.soft` halo (see field). E from anywhere in the ticket opens this tab with focus on "Escalate to".
- **disabled**: If nobody can receive escalations, the select is disabled with "Nobody available", the button is disabled and the note reads "Add an Owner or Admin in Settings › Team."
- **loading**: On escalate, the button shows `.spin` and is disabled; on confirmation the tab switches to the escalated variant, ticket-bar shows "ESCALATED" and a toast says "[ID] escalated".
- **error**: If it fails, the form stays and a bad callout with `role="alert"` appears above the button ("The ticket could not be escalated. Try again.").

## Accessibility

- The panel is the `role="tabpanel"` of the Escalate tab.
- The color dot is decorative: every signal has its name and value in text.
- Fields carry `<label for>`. The button names the ticket it escalates.
- The summary is not a live alert: no `role="alert"`.

## Domain value

A frustrated P1 from support@acme.com with an overdue SLA shows its three signals at the top, and the agent escalates it to an Admin with the reason in one step.

## Platforms

- **web**: Triage app in the browser, panel of `layout.context`. Below `layout.breakpoint`, full width under the ticket.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
