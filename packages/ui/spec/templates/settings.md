# settings

## Purpose

Workspace configuration.

## Variants

- Shell: sidebar · sub-navigation (`layout.settings-nav`, nav-item `.snav` entries) · page view `.page.narrow` with page-header · status-bar.
- Sub-navigation: Workspace, Team, Integrations, Triage Engine, SLA by priority, Billing, Security, API & Webhooks. Knowledge base articles live in the Knowledge view (see knowledge).
- Sections, each opened by its page-header:
  - Workspace (title only): card with the 56px workspace avatar and the name field; grid with URL (mono field) and timezone (select field); settings-row for the default workspace language; page-header form footer.
  - Team (title, description "3 / 5 seats used on the Pro plan.", Invite): seats bar and member-row list in a card.
  - Integrations (title, description): integration-card grid, then "Support channels" with a settings-row ("Email inboxes" → "Manage").
  - Triage Engine (title, description "How Kairo decides what enters your cockpit and what is filtered."): "ACTIVE TIERS" card with switch tier rows (T0–T3); card with the confidence threshold range field; "CUSTOM CATEGORIES" with an add field, Add (secondary) and removable chips; form footer.
  - SLA by priority (title, description): three sla-policy-card entries (P1, P2, P3) and a form footer with Save changes.
  - Security (title only): card with settings-row entries Password (Set password) and Two-factor authentication (coming soon).
  - Billing and API & Webhooks: page-header title and the pending empty-state.

## States

- **default**: Workspace section.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Section content is replaced by skeleton cards of three rows; the sub-navigation stays available.
- **error**: SLA order validation message.

## Accessibility

- Every input has a label; switches carry the row name. One `<h1>` per section: the page-header title.

## Domain value

Controls how Kairo decides what enters the cockpit for the Acme workspace.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the sub-navigation stacks above the content.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
