# Ticket-created follow-ups

Everything a brand-new ticket receives after it is created, whichever flow created it. One function, `runTicketCreatedFollowUps` in `ticket-created-follow-ups.ts`, runs the activities; every flow calls it right after it creates a ticket, including the raw-insert fallbacks. Nothing it does blocks or fails ticket creation.

## Flows

| Flow | Source file |
|---|---|
| `tier1` | `functions/pipeline/tier1-fast-path.ts` |
| `incremental-sync` | `functions/pipeline/incremental-sync.ts` |
| `tier2` | `functions/pipeline/tier2-background.ts` |
| `tier3` | `functions/pipeline/tier3-deferred.ts` |
| `classification-retry-sweep` | `functions/pipeline/classification-retry-sweep.ts` |
| `gmail-poll` | `lib/gmail-poll/poll-account.ts` |

## Where each activity runs

The table lives in `FOLLOW_UP_APPLICABILITY`. Every cell is explicit: `true` runs the activity, `{ skip }` states why it does not. The types force a decision for every flow and activity, and the test in `ticket-created-follow-ups.test.ts` fails when a file that creates tickets does not call the follow-ups or when a flow has no call site.

| Activity | tier1 | incremental-sync | tier2 | tier3 | classification-retry-sweep | gmail-poll |
|---|---|---|---|---|---|---|
| contact-extraction | yes | yes | yes | yes | yes | yes |
| semantic-index | yes | yes | yes | yes | yes | yes |
| shadow-classification | yes | yes | yes | yes | yes | yes |
| escalation-detection | yes | yes | yes | yes | yes | yes |
| acknowledgement | yes | yes | yes | yes | yes | yes |
| out-of-hours-reply | yes | yes | no | no | no | yes |

`out-of-hours-reply` is skipped in `tier2`, `tier3` and `classification-retry-sweep` because those flows do not ingest live inbound mail, so they never reply to the customer.

## What each activity does and when it acts

| Activity | Module | Effect | Conditions |
|---|---|---|---|
| contact-extraction | `contact-extraction-trigger.ts` | Emits `tickets/ticket.created` so draft contacts are extracted | `enable_contact_extraction` |
| semantic-index | `semantic-indexing.ts` | Requests the ticket's embedding for similar-ticket search | `enable_embeddings` and `enable_embedding_indexing` |
| shadow-classification | `jev-shadow-classification.ts` | Runs the JEV classifier beside the real one and logs the outcome to `llm_calls`; never applied to the ticket | `enable_jev_shadow_classification`, and the flow passes the classified email |
| escalation-detection | `detectEscalationTriggers` in `@kairo/intelligence` | Stores escalation reasons in `ticket_proposals.escalation_reasons` | Stored in the proposal the flow just wrote, else the ticket's latest proposal; with none, it logs a warning and stores nothing |
| acknowledgement | `ticket-acknowledgement.ts` | Queues a receipt email with the ticket number through the outbox | `enable_ticket_acknowledgement`; the open customer message arrived at most `ticket_acknowledgement_window_hours` ago (default 48); the sender is not one of the account's own mailboxes; the thread id and a parseable sender exist |
| out-of-hours-reply | `out-of-hours-reply.ts` | Replies automatically outside the account's schedule | The acknowledgement was not sent; the email arrived at most 15 minutes ago; the schedule check allows it |

The acknowledgement runs first. When it goes out, the out-of-hours reply is not sent for the same email.

## Configuration

| Variable | Default | Controls |
|---|---|---|
| `FEATURE_FLAG_ENABLE_TICKET_ACKNOWLEDGEMENT` | `false` | Turns the acknowledgement on |
| `FEATURE_FLAG_TICKET_ACKNOWLEDGEMENT_WINDOW_HOURS` | `48` | Hours back from now within which the open customer message must have arrived; invalid values fall back to 48 |

## Adding a flow or an activity

- New flow: add it to `TICKET_CREATION_FLOWS`, then give every activity a decision for it in `FOLLOW_UP_APPLICABILITY`. The type check lists what is missing.
- New activity: add it to `TICKET_FOLLOW_UPS`, give it a decision for every flow, and run it from `runTicketCreatedFollowUps` behind `applies(...)`.
