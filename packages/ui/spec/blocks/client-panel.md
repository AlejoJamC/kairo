# client-panel

## Purpose

Client tab of the context panel: who wrote, their account and their other tickets.

## Variants

- Column with an 18px gap and 18px padding.
- Header (`.chead`, 12px gap): soft avatar of 38px with the initials · column with the name 14px/600 with ellipsis plus the draft-client badge (`.tag.draft`) when the client was detected automatically, and the mono 11.5px email in `text.tertiary` with ellipsis.
- Draft notice (draft clients only): internal callout with the info icon in `notes.label`: "Draft detected automatically. Confirm, reject and edit actions will be available soon."
- Account: `label` header "ACCOUNT" and six prop-row entries: Plan (20px chip) · MRR (mono) · Since · Tickets (mono count as `.lnk`, opens Clients filtered by this client) · CSAT (mono) · NPS (mono). No value: —.
- Other tickets (when there are any): `label` header "OTHER TICKETS" and one compact ticket row of source-list per ticket of the same client, without the current one.
- Similar tickets (when there are any): `label` header "SIMILAR TICKETS" and one similar ticket row of source-list.
- Sections without rows are not shown: there is never a header without content.
- Confirmed client: no draft badge and no notice. Draft client: both. No client data: only the header with the ticket sender and, under it, "Client data unavailable." in 13px `text.tertiary`.

## States

- **default**: As described in Variants.
- **hover**: source-list rows and the `.lnk` count (underlined).
- **active**: Opening a row selects that ticket in its queue (Triage, Awaiting customer or Resolved) and refreshes this panel.
- **disabled**: Not applicable.
- **loading**: Header with a 38px circle and two `.shim` bars (12px at 60%, 10px at 40%); prop-row values show a `.shim` of 10px at 40%.
- **error**: If the account does not load, "The client data could not be loaded." in 13px `text.tertiary` takes its place; the header keeps the ticket data.

## Accessibility

- The panel is the `role="tabpanel"` of the Client tab.
- The avatar is decorative (`aria-hidden`); the name is next to it.
- Section headers use `role="heading" aria-level="3"`.
- Every ticket row is a `<button>` with `aria-label` "[ID] [subject], [location]".

## Domain value

For a ticket from support@acme.com, the agent sees that Acme is a draft client with two tickets and one similar ticket about the same issue.

## Platforms

- **web**: Triage app in the browser, panel of `layout.context`. Below `layout.breakpoint`, full width under the ticket.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
