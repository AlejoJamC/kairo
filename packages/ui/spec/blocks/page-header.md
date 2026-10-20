# page-header

## Purpose

Header and frame of the app page views (Clients, Knowledge and every Settings section), the counterpart of queue-header for views that are not queues.

## Variants

- Frame `.page` (Clients, Knowledge): max width `layout.page`, padding 32px 36px 48px, 22px gap, on `surface.page`, page scroll.
- Frame `.page.narrow` (Settings and the article editor): max width `layout.settings`, padding 36px 44px 56px, 20px gap. In Settings it sits to the right of the sub-navigation: nav-item `.snav` entries in a `layout.settings-nav` column on `surface.panel` with a `border.default` right border, padding 24px 12px and the `label` header "SETTINGS".
- Header (`.pghead`): `<h1>` in `typography.page-title`.
  - With count: `.cnt` 13px on the same line, baseline aligned ("Clients 6").
  - With description: below, in `text.tertiary` with line height 1.5, 6px gap ("Connect the channels your support arrives through.").
  - With action: on the right, a single primary button of `size.control-lg` ("Invite", "Add article").
- Toolbar (under the header, optional; flex with wrap, 8px gap): filter-pill groups with `.pill-div` between groups · search (`.search`: `size.control-lg`, `radius.field`, `border.default`, `surface.panel`, 240 to 420px; 13px magnifier in `text.tertiary` + borderless 12.5px input; on focus the border and halo of field) · flexible space · secondary buttons of `size.control-lg` ("Export") and the primary action when it is not in the header.
- Form footer (`.formfoot`): `border.default` top border, 14px top padding, right aligned: Discard (secondary, `size.control-lg`, padding 0 14px) and Save changes (primary, `size.control-lg`, padding 0 16px).
- Per view: Clients: title + count with toolbar. Knowledge: title + count + description + action with toolbar. Settings › Workspace and Security: title only. Settings › Integrations, Triage Engine and SLA by priority: title + description. Settings › Team: title + description + action.

## States

- **default**: As described in Variants.
- **hover**: Only the controls it contains.
- **active**: Search focused; the current filter `.on`.
- **disabled**: Save changes is disabled while there are no changes.
- **loading**: The count shows — until there is data. On save, Save changes shows `.spin`.
- **error**: If saving fails, a bad callout with `role="alert"` above the footer explains it. On success, a toast says "Changes saved".

## Accessibility

- One `<h1>` per view: the header one.
- The search field has a visually hidden label ("Search clients", "Search articles").
- The count carries visually hidden text with its unit ("6 clients").

## Domain value

Every page of the Acme workspace starts the same way: what it is, how many items it has and its one main action.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint`, padding 20px 16px 32px; the toolbar wraps and the search takes the full width; the Settings sub-navigation stacks above the content.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
