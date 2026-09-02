// KAI-191 follow-up — single source of truth for the ticket classification
// vocabulary (ticket_type, priority, category, tone). These are stable,
// language-neutral IDs the LLM emits (see packages/intelligence's
// ClassificationSchema, which imports these arrays rather than declaring its
// own) and that every other consumer — the dashboard's correction dialog,
// the API's correct-classification endpoint, packages/ui's emotion/type
// tokens, and the `chk_ticket_type`/`chk_category`/`chk_emotion`/
// `chk_sentiment`/`chk_tta_ticket_type`/`chk_proposed_emotion` CHECK
// constraints in Postgres — must derive from instead of re-listing.

export const TICKET_TYPES = ['support', 'prospect', 'spam', 'internal', 'other'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_PRIORITIES = ['P1', 'P2', 'P3'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_CATEGORIES = ['technical', 'billing', 'account', 'general', 'not_applicable'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

// Holds both `tickets.emotion` and `tickets.sentiment` — two columns that
// share this exact vocabulary today (see chk_emotion/chk_sentiment in
// supabase/schema.sql). Reconciling those two columns into one is a schema
// question of its own, out of scope here; this type only unifies the value
// vocabulary both columns already restrict themselves to.
export const TICKET_TONES = ['aggressive', 'frustrated', 'neutral', 'positive'] as const;
export type TicketTone = (typeof TICKET_TONES)[number];
