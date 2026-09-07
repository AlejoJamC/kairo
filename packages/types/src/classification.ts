// KAI-191 follow-up — single source of truth for the ticket classification
// vocabulary (ticket_type, priority, category, tone, urgency). These are
// stable, language-neutral IDs the LLM emits (see packages/intelligence's
// ClassificationSchema, which imports these arrays rather than declaring its
// own) and that every other consumer must derive from instead of re-listing.
// type/priority/category/tone are additionally persisted, restricted by the
// `chk_ticket_type`/`chk_category`/`chk_emotion`/`chk_sentiment`/
// `chk_tta_ticket_type`/`chk_proposed_emotion` CHECK constraints in Postgres,
// and consumed by the dashboard's correction dialog, the API's
// correct-classification endpoint, and packages/ui's emotion/type tokens.
// urgency is not persisted (it's an intermediate LLM signal), but it's still
// canonical classification vocabulary with more than one consumer today
// (packages/intelligence, scripts/eval) — it belongs here for the same
// reason the others do: one place to look, one place that can't drift.

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

export const TICKET_URGENCIES = ['high', 'medium', 'low'] as const;
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];
