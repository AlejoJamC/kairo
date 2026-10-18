# sla-indicator

## Purpose

Shows the SLA state of a ticket and the SLA scale in settings.

## Variants

- Compact (queue row): 12px clock + mono 11px time in `sla.overdueText`.
- Full (ticket header): 14px clock + "SLA overdue by …" 12.5px/500 in `sla.overdueText`, "no first response" in `text.tertiary`, 120×4px bar in `sla.overdueBar`.
- Scale (settings): 8px bar on `sla.track` with on-time, at-risk and escalation segments and a 2px minimum marker; mono legend min / alert / escalation / breach.

## States

- **default**: Shown only when the SLA is known.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Settings: "The order must be minimum < alert < escalation < maximum" in `color.bad-ink` when values are out of order.

## Accessibility

- The clock icon is decorative; the time is text. The compact variant carries `title`.

## Domain value

SLA per priority in calendar minutes, 24/7.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Mobile companion app: compact variant only, with a 14px clock and the mono 12px time in `sla.overdueText`. The full variant and the scale are not used.
