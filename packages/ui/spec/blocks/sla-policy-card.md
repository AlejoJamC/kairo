# sla-policy-card

## Purpose

SLA policy of one priority in Settings › SLA by priority.

## Variants

- One card per priority (P1, P2, P3), stacked with a 20px gap under the page-header "SLA by priority" and its description: "Configurable response times per ticket priority (P1/P2/P3). In minutes. Runs on calendar time, 24/7."
- Card padding 18px 20px, 14px gap.
- Header (flex with wrap, 8px gap): 14px priority-glyph · title 600: "P1 — Urgent", "P2 — High", "P3 — Normal" · flexible space · validation message (see States).
- Fields (grid `repeat(auto-fit, minmax(min(150px, 100%), 1fr))`, 12px gap): four fields with the unit "min". The label (`label` style) has a 7px square with 2px radius (`.slaq`) in the threshold color before the text, and takes 30px of height aligned to the bottom so the fields line up when a label wraps.
  - Maximum response time: `sla.overdueBar`.
  - Minimum response time: `sla.minimumMarker`.
  - Risk alert: `sla.atRisk`.
  - Automatic escalation: `sla.escalation`.
- Scale (`.sla-scale`, 6px gap to its legend): 8px bar on `sla.track` with three segments proportional to the maximum: on time up to the alert (`sla.onTime`), at risk up to the escalation (`sla.atRisk`), escalating up to the maximum (`sla.escalation`), and a 2px marker in `sla.minimumMarker` at the minimum. Mono 11px legend, 14px gap: "min 15 min" in `text.tertiary` · "alert 30 min" in `sla.alertLabel` · "escalation 45 min" in `sla.escalationLabel` · "breach 1 h" in `sla.breachLabel`.
- The same segments and colors are the states of sla-indicator in the queue and the ticket.

## States

- **default**: Saved values; the scale reflects the fields.
- **hover**: Only the fields (see field).
- **active**: While typing, the scale and the legend update at once. Hours show as "h" when the value is a multiple of 60 and with one decimal otherwise ("1.5 h").
- **disabled**: People who are not Owner or Admin see the fields read-only (`surface.hover`, `text.secondary`).
- **loading**: Fields show `.shim` and the bar stays empty.
- **error**: If the order is not minimum < alert < escalation < maximum, the header shows "The order must be minimum < alert < escalation < maximum" in 12px `color.bad-ink`, out-of-order fields take a `color.bad-line` border and Save changes is disabled.

## Accessibility

- Each field is `type="number"` with `min="1"`, its `<label for>` and the unit in `aria-describedby`.
- The color square is decorative; the threshold name is in the label.
- The scale is decorative (`aria-hidden`): the text legend gives the same values.
- The validation message carries `role="alert"`.

## Domain value

The Owner of Acme sets P1 to a one-hour maximum, alert at 30 minutes and automatic escalation at 45, and sees the scale before saving.

## Platforms

- **web**: Triage app in the browser, inside `.page.narrow`. Below `layout.breakpoint` the fields go to two columns and then one.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
