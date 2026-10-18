# settings

## Purpose

Workspace configuration.

## Variants

- Sub-navigation (236px): Workspace, Team, Integrations, Triage Engine, SLA by priority, Knowledge base, Billing, Security, API & Webhooks.
- Designed sections: Workspace (name, URL, timezone, default language), Team (seats bar, member rows), Integrations, Triage Engine (tiers, confidence threshold, custom categories), SLA by priority, Security (password, two-factor coming soon).
- Knowledge base, Billing and API & Webhooks are placeholders pending reference.

## States

- **default**: Workspace section.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Section content is replaced by skeleton cards of three rows; the sub-navigation stays available.
- **error**: SLA order validation message.

## Accessibility

- Every input has a label; switches carry the row name.

## Domain value

Controls how Kairo decides what enters the cockpit.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
