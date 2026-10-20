# sla-indicator

## Purpose

Shows the first-response SLA of a ticket: how much time is left or how long since it was breached.

## Variants

- Compact (`.sla`, queue row and panels): 12px clock + mono 11px time, with `title`.
- Full (`.sla-full`, ticket-heading): 14px clock + phrase 12.5px/500 · "no first response" in `text.tertiary` · 120×4px bar (`.sla-bar`) on `sla.track`, filled in proportion to the elapsed time over the maximum (full when breached).
- Four SLA states, following the thresholds of sla-policy-card:
  - On time (before the risk alert): compact "in 2h 10m" in `text.tertiary`; full "SLA: reply in 2h 10m" in `text.secondary`; bar `sla.onTime`.
  - At risk (between the alert and the automatic escalation): compact "in 40m"; full "SLA at risk · 40m left"; text `sla.atRiskText`; bar `sla.atRisk`.
  - Escalating (between the automatic escalation and the maximum): compact "in 12m"; full "SLA almost breached · escalates in 12m"; text `sla.escalationText`; bar `sla.escalation`.
  - Overdue (past the maximum): compact "153d"; full "SLA overdue by 153d 22h 13m"; text `sla.overdueText`; bar `sla.overdueBar`, full.
- The compact variant tells remaining time ("in 40m") from overdue time ("153d") by the text, not only by color. Time uses the largest unit that makes sense: d, h, m.
- Scale (settings): see sla-policy-card.

## States

- **default**: The four SLA states above; refreshed every minute. Shown only when the SLA is known and there is no first response yet.
- **hover**: The compact variant shows its `title` ("SLA at risk: 40m left"); its shape does not change.
- **active**: Not applicable.
- **disabled**: Not applicable. With no known SLA, or with the first response sent, the indicator is not shown.
- **loading**: Nothing is shown until there is data.
- **error**: If the SLA could not be computed, it is not shown; a time is never invented.

## Accessibility

- The clock icon is decorative; the time is text. The compact variant carries `title` and visually hidden text with the full phrase of the state; the full variant is text.
- Text colors meet 4.5:1: `sla.atRiskText` 5.02:1, `sla.escalationText` 5.18:1, `sla.overdueText` 5.53:1 on `surface.panel`. The bar is decorative.
- State changes are not announced live: the queue is not an `aria-live` region.

## Domain value

SLA per priority in calendar minutes, 24/7. A P1 from support@acme.com turns at risk 30 minutes before the escalation and overdue after one hour.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the full variant may wrap to two lines (phrase on top, note and bar below).
- **desktop**: Triage desktop app, same component.
- **mobile**: Mobile companion app: compact variant only, with a 14px clock and the mono 12px time, in the four SLA states with the same text tokens. The full variant and the scale are not used.
