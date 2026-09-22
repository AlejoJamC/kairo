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

// ---------------------------------------------------------------------------
// KAI-45 — the two axes the model emits, from which `ticket_type` is derived.
//
// The five `TICKET_TYPES` above are not a partition: they are the product of two
// independent questions, and a message can have a true value on both. Email 101
// of the coverage corpus is a forward between two of the company's own mailboxes
// AND an invitation to bid — `internal` and `prospect` are both correct readings,
// which is why five rounds of rubric edits never settled it. A single five-way
// choice cannot represent a cartesian product.
//
// So the model stops choosing a type and answers the two questions separately.
// `ticket_type` is then derived in code from (provenance × these two), where
// provenance is computed from the envelope, never inferred. `TICKET_TYPES`
// remains the persisted contract and nothing downstream changes.
//
// Neither axis is a label: the derivation table is what turns them into one, and
// that table is fitted to reproduce the human ground truth, never the reverse.
// ---------------------------------------------------------------------------

/**
 * Does the sender expect the company to do something?
 *
 * This is the axis the product already weighs: `TYPE_SCORE` in the API's
 * scoring module separates `support` (0.8) from everything else (0.3 and below),
 * and that separation is exactly this question.
 */
export const ACTIONABILITY = ['needs_action', 'fyi'] as const;
export type Actionability = (typeof ACTIONABILITY)[number];

/**
 * What the message is about, in terms of the company's own activity.
 *
 * - `service`           — the service the company sells to its customers
 * - `commercial_demand` — the sender wants to buy from us
 * - `commercial_offer`  — the sender wants to sell to us
 * - `admin`             — the company's own housekeeping: personnel,
 *                         compliance, paperwork, notifications from its own
 *                         systems
 *
 * The commercial value carries **direction**, and that is the whole reason it
 * is split. `prospect` and `other` differ by who is selling to whom, and until
 * now the table encoded that difference as `needs_action` vs `fyi` — which
 * cannot work, because an unsolicited vendor offer does ask for action. The
 * model answered `needs_action` and was right by the rubric; the rubric was
 * wrong. Measured on the coverage corpus: all 10 model errors were commercial
 * mail, and `other` scored 2/10.
 *
 * Direction is a fact stated in the message. Intensity is a judgement the two
 * cases share. Asking for the one the text answers is the point.
 *
 * Deliberately not `internal` vs `external`: that is provenance, it is readable
 * off the envelope, and asking the model for it is asking it to redo a string
 * comparison the deterministic layer already did.
 */
export const SUBJECT_MATTER = ['service', 'commercial_demand', 'commercial_offer', 'admin'] as const;
export type SubjectMatter = (typeof SUBJECT_MATTER)[number];

/**
 * Where the message came from, relative to the mailbox Kairo reads. Computed
 * from `MailFacts`, never emitted by a model.
 *
 * Three states, not four: there is no `outbound`. This pipeline only reads an
 * inbox — mail the company sends lives in `messages.direction = 'outbound'`,
 * written by the reply flow, and never reaches the classifier.
 */
export const PROVENANCE = ['tenant_mailbox', 'same_company', 'external'] as const;
export type Provenance = (typeof PROVENANCE)[number];
