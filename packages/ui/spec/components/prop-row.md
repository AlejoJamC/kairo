# prop-row

## Purpose

Key–value row for entity properties.

## Variants

- App (`.prop`): 84px key column, 34px min height, 13px, `border.default` bottom divider (last row without).
- Compact (`.prop.sm`): 32px, 12.5px; invite card and product frame.

## States

- **default**: Key in `text.tertiary`; numeric values in mono; unknown values shown as —.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Use a definition list or a two-column grid with the key as visible text.

## Domain value

Client account: Plan, MRR, Since, Tickets, CSAT, NPS. Invite: Workspace, Role, Expires.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
