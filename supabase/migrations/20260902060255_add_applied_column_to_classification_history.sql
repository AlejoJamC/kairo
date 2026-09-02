-- KAI-191 fix (code review finding #3). POST /:id/classify-approve emits the
-- same shape — to_value set, review outcome buried in
-- metadata.review_outcome — for both a confirmed AND a rejected proposal.
-- Whether the value was actually applied to the ticket is a fact this table
-- exists to record, and it was the one fact missing a real column.
--
-- `applied` is a plain boolean: this is a two-state fact, not an open-ended
-- category, so text with a CHECK over two literals would just be a boolean
-- wearing a costume. `to_value` stays populated on rejection too — nulling
-- it based on `applied` would encode the same fact twice through two
-- columns instead of once, which is the redundancy this fix removes, not
-- reintroduces. `to_value` always answers "what value was in question";
-- `applied` alone answers "did it take".

ALTER TABLE "public"."ticket_classification_history"
    ADD COLUMN "applied" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."ticket_classification_history"
    ALTER COLUMN "applied" DROP DEFAULT;

COMMENT ON COLUMN "public"."ticket_classification_history"."applied" IS 'Whether to_value actually became the ticket''s attribute. true for every AI classification pass and every human correction (both write real, applied values); false only for a rejected AI proposal reviewed via POST /:id/classify-approve, where to_value still records what was proposed and rejected.';
