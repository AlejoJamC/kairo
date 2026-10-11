-- KAI-94
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS human_modified_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS case_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS knowledge_context jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS review_status text;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.operational_learning ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.operational_learning ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS operational_learning_source_key ON public.operational_learning(account_id, source_key);
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS kb_articles_source_key ON public.kb_articles(account_id, source_key);

CREATE TABLE public.knowledge_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  source_kind text NOT NULL CHECK (source_kind IN ('article', 'learning')),
  source_id uuid NOT NULL,
  revision bigint GENERATED ALWAYS AS IDENTITY,
  status text NOT NULL CHECK (status IN ('pending_review', 'approved', 'rejected', 'withdrawn')),
  snapshot jsonb NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_versions_source ON public.knowledge_versions(account_id, source_kind, source_id, revision DESC);
CREATE TABLE public.ticket_decision_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id),
  message_id uuid REFERENCES public.messages(id),
  contract text NOT NULL,
  contract_version text NOT NULL,
  case_revision bigint NOT NULL,
  knowledge_version_id uuid REFERENCES public.knowledge_versions(id),
  status text NOT NULL,
  result jsonb NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, idempotency_key)
);
CREATE INDEX ticket_decision_history_ticket ON public.ticket_decision_history(account_id, ticket_id, created_at DESC);
CREATE TABLE public.decision_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  ticket_id uuid REFERENCES public.tickets(id),
  message_id uuid REFERENCES public.messages(id),
  knowledge_version_id uuid REFERENCES public.knowledge_versions(id),
  contract text NOT NULL,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done')),
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, dedupe_key)
);
CREATE INDEX decision_work_pending ON public.decision_work_items(status, available_at);

CREATE FUNCTION public.reject_decision_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Decision and knowledge history is append-only'; END;
$$;
CREATE TRIGGER knowledge_versions_immutable BEFORE UPDATE OR DELETE ON public.knowledge_versions FOR EACH ROW EXECUTE FUNCTION public.reject_decision_history_mutation();
CREATE TRIGGER knowledge_versions_no_truncate BEFORE TRUNCATE ON public.knowledge_versions EXECUTE FUNCTION public.reject_decision_history_mutation();
CREATE TRIGGER ticket_decisions_no_truncate BEFORE TRUNCATE ON public.ticket_decision_history EXECUTE FUNCTION public.reject_decision_history_mutation();
CREATE TRIGGER ticket_decision_history_immutable BEFORE UPDATE OR DELETE ON public.ticket_decision_history FOR EACH ROW EXECUTE FUNCTION public.reject_decision_history_mutation();

ALTER TABLE public.knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_decision_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_work_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_versions_read ON public.knowledge_versions FOR SELECT USING(account_id = public.current_account_id());
CREATE POLICY ticket_decision_history_read ON public.ticket_decision_history FOR SELECT USING(account_id = public.current_account_id());
REVOKE ALL ON public.knowledge_versions, public.ticket_decision_history, public.decision_work_items FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.knowledge_versions_revision_seq FROM anon, authenticated;
GRANT SELECT ON public.knowledge_versions, public.ticket_decision_history TO authenticated;
GRANT ALL ON public.knowledge_versions, public.ticket_decision_history, public.decision_work_items TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.knowledge_versions_revision_seq TO service_role;

CREATE FUNCTION public.record_knowledge_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data jsonb; version_id uuid; version_status text; kind text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - 'embedding' - 'updated_at') = (row_data - 'embedding' - 'updated_at') THEN RETURN NEW; END IF;
  kind := CASE WHEN TG_TABLE_NAME = 'kb_articles' THEN 'article' ELSE 'learning' END;
  version_status := CASE WHEN TG_OP = 'DELETE' THEN 'withdrawn' WHEN kind = 'article' THEN CASE WHEN (row_data->>'is_published')::boolean THEN 'approved' ELSE COALESCE(row_data->>'review_status','pending_review') END ELSE row_data->>'status' END;
  INSERT INTO knowledge_versions(account_id, source_kind, source_id, status, snapshot, actor_user_id)
  VALUES ((row_data->>'account_id')::uuid, kind, (row_data->>'id')::uuid, version_status, row_data - 'embedding', (row_data->>'reviewed_by')::uuid)
  RETURNING id INTO version_id;
  IF version_status = 'approved' OR TG_OP <> 'INSERT' THEN
    INSERT INTO decision_work_items(account_id, knowledge_version_id, contract, dedupe_key)
    VALUES ((row_data->>'account_id')::uuid, version_id, 'knowledge_change', 'knowledge:' || version_id::text) ON CONFLICT DO NOTHING;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER kb_version AFTER INSERT OR UPDATE OR DELETE ON public.kb_articles FOR EACH ROW EXECUTE FUNCTION public.record_knowledge_version();
CREATE TRIGGER learning_version AFTER INSERT OR UPDATE OR DELETE ON public.operational_learning FOR EACH ROW EXECUTE FUNCTION public.record_knowledge_version();

-- Existing knowledge receives a baseline snapshot without inventing an approving actor.
INSERT INTO public.knowledge_versions(account_id, source_kind, source_id, status, snapshot, actor_user_id)
SELECT account_id, 'article', id, CASE WHEN is_published THEN 'approved' ELSE 'pending_review' END, to_jsonb(a) - 'embedding', reviewed_by FROM public.kb_articles a;
INSERT INTO public.knowledge_versions(account_id, source_kind, source_id, status, snapshot, actor_user_id)
SELECT account_id, 'learning', id, status, to_jsonb(l), reviewed_by FROM public.operational_learning l;

CREATE FUNCTION public.capture_ticket_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.model_verdict IS NOT DISTINCT FROM OLD.model_verdict THEN RETURN NEW; END IF;
  END IF;
  c := CASE WHEN NEW.classification_tier = 1 THEN 'onboarding_triage' WHEN NEW.classification_tier IN (2,3) THEN 'historical_learning' ELSE 'incoming_email_decision' END;
  INSERT INTO ticket_decision_history(account_id, ticket_id, contract, contract_version, case_revision, status, result, idempotency_key)
  VALUES (NEW.account_id, NEW.id, c, COALESCE(NEW.model_verdict->'workflow'->>'version','legacy'), NEW.case_revision,
    'pending_knowledge', jsonb_build_object('verdict',NEW.model_verdict,'promptVersion',NEW.prompt_version,'derivationVersion',NEW.derivation_version,'missing',jsonb_build_array('approved_knowledge'),'authorization','human_review'),
    'classification:' || NEW.id || ':' || NEW.case_revision) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
-- History is inserted after the ticket exists; revision is maintained separately.
CREATE FUNCTION public.advance_case_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.assigned_to, NEW.priority, NEW.category, NEW.status, NEW.model_verdict, NEW.body_plain, NEW.human_modified_at)
     IS DISTINCT FROM ROW(OLD.assigned_to, OLD.priority, OLD.category, OLD.status, OLD.model_verdict, OLD.body_plain, OLD.human_modified_at) THEN NEW.case_revision := OLD.case_revision + 1; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ticket_case_revision BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.advance_case_revision();
CREATE TRIGGER ticket_decision_capture AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.capture_ticket_decision();

CREATE FUNCTION public.enqueue_message_decision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.tickets; m public.messages;
BEGIN
  SELECT * INTO t FROM tickets WHERE id = NEW.ticket_id;
  SELECT * INTO m FROM messages WHERE id = NEW.message_id AND account_id = t.account_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Message and ticket account mismatch'; END IF;
  UPDATE tickets SET case_revision = case_revision + 1 WHERE id = t.id;
  IF m.direction = 'inbound' AND COALESCE(m.processing_tier, 0) <> 1 THEN
    INSERT INTO decision_work_items(account_id,ticket_id,message_id,contract,dedupe_key)
    VALUES(t.account_id,t.id,m.id,CASE WHEN COALESCE(m.processing_tier,0) IN (2,3) THEN 'historical_learning' ELSE 'incoming_email_decision' END,'message:'||m.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER message_decision_enqueue AFTER INSERT ON public.ticket_messages FOR EACH ROW EXECUTE FUNCTION public.enqueue_message_decision();

CREATE FUNCTION public.claim_decision_work(p_limit integer DEFAULT 10) RETURNS SETOF public.decision_work_items LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE decision_work_items SET status='running', available_at=now()+interval '20 minutes'
  WHERE id IN (SELECT id FROM decision_work_items WHERE status <> 'done' AND available_at <= now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,50))) RETURNING *;
$$;
CREATE FUNCTION public.mark_ticket_viewed(p_account_id uuid,p_ticket_id uuid,p_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role IN ('owner','admin','supervisor','agent')) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  UPDATE tickets SET first_viewed_at=COALESCE(first_viewed_at,now()) WHERE id=p_ticket_id AND account_id=p_account_id;
END;
$$;
CREATE FUNCTION public.record_ticket_enrichment(p_account_id uuid,p_ticket_id uuid,p_revision bigint,p_version_id uuid,p_result jsonb,p_useful boolean,p_key text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.tickets; v public.knowledge_versions; outcome text; touched boolean;
BEGIN
  SELECT * INTO v FROM knowledge_versions WHERE id=p_version_id AND account_id=p_account_id;
  IF v.source_kind='article' THEN PERFORM 1 FROM kb_articles WHERE id=v.source_id FOR SHARE;
  ELSE PERFORM 1 FROM operational_learning WHERE id=v.source_id FOR SHARE; END IF;
  SELECT * INTO t FROM tickets WHERE id=p_ticket_id AND account_id=p_account_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  IF EXISTS(SELECT 1 FROM ticket_decision_history WHERE account_id=p_account_id AND idempotency_key=p_key) THEN RETURN 'already_evaluated'; END IF;
  IF t.case_revision <> p_revision THEN RETURN 'stale_case'; END IF;
  IF v.id IS NULL OR v.status <> 'approved' OR EXISTS(SELECT 1 FROM knowledge_versions WHERE account_id=p_account_id AND source_kind=v.source_kind AND source_id=v.source_id AND revision>v.revision) THEN RETURN 'stale_knowledge'; END IF;
  touched := t.first_viewed_at IS NOT NULL OR t.human_modified_at IS NOT NULL OR EXISTS(SELECT 1 FROM ticket_state_history WHERE ticket_id=t.id AND actor_type='human') OR EXISTS(SELECT 1 FROM ticket_activity_log WHERE ticket_id=t.id AND actor_type='human') OR EXISTS(SELECT 1 FROM classification_feedback WHERE ticket_id=t.id) OR EXISTS(SELECT 1 FROM ticket_classification_history WHERE ticket_id=t.id AND actor_type='human') OR EXISTS(SELECT 1 FROM ticket_notes WHERE ticket_id=t.id);
  outcome := CASE WHEN NOT p_useful THEN 'evaluated_without_contribution' WHEN touched THEN 'pending_human_review' ELSE 'enriched' END;
  INSERT INTO ticket_decision_history(account_id,ticket_id,contract,contract_version,case_revision,knowledge_version_id,status,result,idempotency_key)
  VALUES(p_account_id,t.id,'knowledge_impact','1.0.0',p_revision,v.id,outcome,p_result,p_key);
  IF outcome='enriched' THEN UPDATE tickets SET knowledge_context=knowledge_context || jsonb_build_object(v.source_id::text,jsonb_build_object('versionId',v.id,'result',p_result)) WHERE id=t.id; END IF;
  RETURN outcome;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_decision_work(integer), public.mark_ticket_viewed(uuid,uuid,uuid), public.record_ticket_enrichment(uuid,uuid,bigint,uuid,jsonb,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_decision_work(integer), public.mark_ticket_viewed(uuid,uuid,uuid), public.record_ticket_enrichment(uuid,uuid,bigint,uuid,jsonb,boolean,text) TO service_role;

CREATE VIEW public.latest_knowledge WITH (security_invoker=true) AS
SELECT DISTINCT ON (account_id,source_kind,source_id) * FROM public.knowledge_versions ORDER BY account_id,source_kind,source_id,revision DESC;
CREATE VIEW public.current_knowledge WITH (security_invoker=true) AS SELECT * FROM public.latest_knowledge WHERE status='approved';
GRANT SELECT ON public.latest_knowledge TO authenticated, service_role;
GRANT SELECT ON public.current_knowledge TO authenticated, service_role;

CREATE FUNCTION public.knowledge_search_query(p_text text) RETURNS tsquery LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN count(*)=0 THEN NULL ELSE to_tsquery('simple',string_agg(quote_literal(word),' | ')) END
 FROM (SELECT unnest(tsvector_to_array(to_tsvector('spanish',p_text))) AS word) words WHERE length(word)>3;
$$;
CREATE FUNCTION public.find_workflow_knowledge(p_account_id uuid,p_query text,p_ticket_id uuid DEFAULT NULL) RETURNS SETOF public.knowledge_versions LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT v.* FROM current_knowledge v WHERE v.account_id=p_account_id AND (
  to_tsvector('spanish',COALESCE(v.snapshot->>'content',v.snapshot->>'summary','')) @@ knowledge_search_query(p_query)
  OR v.snapshot->'ticket_ids' @> jsonb_build_array(p_ticket_id::text))
 ORDER BY ts_rank(to_tsvector('spanish',COALESCE(v.snapshot->>'content',v.snapshot->>'summary','')),knowledge_search_query(p_query)) DESC, v.revision DESC LIMIT 12;
$$;
CREATE FUNCTION public.enqueue_knowledge_candidates(p_version_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.knowledge_versions; n integer;
BEGIN
 SELECT * INTO v FROM knowledge_versions WHERE id=p_version_id;
 IF v.id IS NULL THEN RETURN 0; END IF;
 IF v.source_kind='article' THEN PERFORM 1 FROM kb_articles WHERE id=v.source_id FOR SHARE;
 ELSE PERFORM 1 FROM operational_learning WHERE id=v.source_id FOR SHARE; END IF;
 IF EXISTS(SELECT 1 FROM knowledge_versions WHERE account_id=v.account_id AND source_kind=v.source_kind AND source_id=v.source_id AND revision>v.revision) THEN RETURN 0; END IF;
 IF v.status <> 'approved' THEN
   INSERT INTO ticket_decision_history(account_id,ticket_id,contract,contract_version,case_revision,knowledge_version_id,status,result,idempotency_key)
   SELECT account_id,id,'knowledge_impact','1.0.0',case_revision,v.id,'pending_knowledge',jsonb_build_object('missing',jsonb_build_array('approved_knowledge'),'withdrawnVersion',knowledge_context->v.source_id::text->>'versionId'),'withdrawal:'||id||':'||v.id
   FROM tickets WHERE account_id=v.account_id AND knowledge_context ? v.source_id::text ON CONFLICT DO NOTHING;
   UPDATE tickets SET knowledge_context=knowledge_context-v.source_id::text WHERE account_id=v.account_id AND knowledge_context ? v.source_id::text;
   RETURN 0;
 END IF;
 INSERT INTO decision_work_items(account_id,ticket_id,knowledge_version_id,contract,dedupe_key)
 SELECT t.account_id,t.id,v.id,'knowledge_impact','impact:'||t.id||':'||t.case_revision||':'||v.id FROM tickets t
 WHERE t.account_id=v.account_id AND (
  to_tsvector('spanish',COALESCE(t.subject,'')||' '||COALESCE(t.body_plain,'')) @@ knowledge_search_query(COALESCE(v.snapshot->>'title','')||' '||COALESCE(v.snapshot->>'content',v.snapshot->>'summary',''))
  OR v.snapshot->'ticket_ids' @> jsonb_build_array(t.id::text)
  OR v.snapshot->'tags' @> jsonb_build_array('origin-ticket:'||t.id)
  OR t.knowledge_context ? v.source_id::text)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END;
$$;
CREATE FUNCTION public.enqueue_pending_knowledge(p_account_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; n integer:=0;
BEGIN
 FOR v IN SELECT id FROM current_knowledge WHERE account_id=p_account_id LOOP n:=n+enqueue_knowledge_candidates(v.id); END LOOP;
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.find_workflow_knowledge(uuid,text,uuid), public.enqueue_knowledge_candidates(uuid), public.enqueue_pending_knowledge(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_workflow_knowledge(uuid,text,uuid), public.enqueue_knowledge_candidates(uuid), public.enqueue_pending_knowledge(uuid) TO service_role;

CREATE FUNCTION public.review_workflow_knowledge(p_account_id uuid,p_user_id uuid,p_kind text,p_id uuid,p_version_id uuid,p_decision text,p_title text DEFAULT NULL,p_content text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_id uuid;
BEGIN
  PERFORM 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role IN ('owner','admin','supervisor','agent') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF p_decision NOT IN ('approved','rejected','pending_review') THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
  IF p_kind='article' THEN PERFORM 1 FROM kb_articles WHERE id=p_id AND account_id=p_account_id FOR UPDATE;
  ELSIF p_kind='learning' THEN PERFORM 1 FROM operational_learning WHERE id=p_id AND account_id=p_account_id FOR UPDATE;
  ELSE RAISE EXCEPTION 'Invalid knowledge kind'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge not found'; END IF;
  SELECT id INTO current_id FROM knowledge_versions WHERE account_id=p_account_id AND source_kind=p_kind AND source_id=p_id ORDER BY revision DESC LIMIT 1;
  IF current_id IS DISTINCT FROM p_version_id THEN RAISE EXCEPTION 'Knowledge changed; refresh before reviewing'; END IF;
  IF p_kind='article' THEN
    UPDATE kb_articles SET title=COALESCE(p_title,title),content=COALESCE(p_content,content),is_published=(p_decision='approved'),review_status=p_decision,reviewed_by=p_user_id,updated_at=now() WHERE id=p_id;
  ELSE
    UPDATE operational_learning SET summary=COALESCE(p_content,summary),status=p_decision,reviewed_by=p_user_id,reviewed_at=now(),evidence=CASE WHEN p_title IS NULL THEN evidence ELSE evidence||jsonb_build_object('title',p_title) END WHERE id=p_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.review_workflow_knowledge(uuid,uuid,text,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_workflow_knowledge(uuid,uuid,text,uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.save_email_knowledge(p_account_id uuid,p_ticket_id uuid,p_message_id uuid,p_articles jsonb,p_learnings jsonb) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; article_id uuid; ids uuid[] := '{}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tickets t JOIN ticket_messages tm ON tm.ticket_id=t.id JOIN messages m ON m.id=tm.message_id WHERE t.id=p_ticket_id AND t.account_id=p_account_id AND m.id=p_message_id AND m.account_id=p_account_id) THEN RAISE EXCEPTION 'Knowledge source mismatch'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_articles) LOOP
   INSERT INTO kb_articles(account_id,title,content,tags,is_published,source_key) VALUES(p_account_id,item->>'title',item->>'content',ARRAY(SELECT jsonb_array_elements_text(item->'tags')),false,item->>'source_key')
   ON CONFLICT(account_id,source_key) DO NOTHING RETURNING id INTO article_id;
   IF article_id IS NULL THEN SELECT id INTO article_id FROM kb_articles WHERE account_id=p_account_id AND source_key=item->>'source_key'; END IF;
   IF article_id IS NOT NULL THEN ids:=array_append(ids,article_id); END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(p_learnings) LOOP
   INSERT INTO operational_learning(account_id,origin,status,learning_type,summary,ticket_ids,source_count,confidence,source_key,evidence)
   VALUES(p_account_id,'system_derived','pending_review',item->>'learning_type',item->>'summary',ARRAY[p_ticket_id],1,NULL,item->>'source_key',item->'evidence') ON CONFLICT(account_id,source_key) DO NOTHING;
 END LOOP;
 RETURN ids;
END;
$$;
REVOKE ALL ON FUNCTION public.save_email_knowledge(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_email_knowledge(uuid,uuid,uuid,jsonb,jsonb) TO service_role;

CREATE FUNCTION public.save_reply_decision(p_account_id uuid,p_ticket_id uuid,p_user_id uuid,p_revision bigint,p_proposal jsonb,p_result jsonb,p_key text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.tickets; proposal_id uuid; ref jsonb;
BEGIN
 PERFORM 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role IN ('owner','admin','supervisor','agent') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
 FOR ref IN SELECT * FROM jsonb_array_elements(p_result->'sources') ORDER BY value->>'id' LOOP
   IF ref->>'kind'='article' THEN PERFORM 1 FROM kb_articles WHERE id=(ref->>'id')::uuid AND account_id=p_account_id FOR SHARE;
   ELSE PERFORM 1 FROM operational_learning WHERE id=(ref->>'id')::uuid AND account_id=p_account_id FOR SHARE; END IF;
 END LOOP;
 SELECT * INTO t FROM tickets WHERE id=p_ticket_id AND account_id=p_account_id FOR UPDATE;
 IF t.id IS NULL OR t.case_revision <> p_revision THEN RAISE EXCEPTION 'Case changed; request a new suggestion'; END IF;
 SELECT (result->>'proposalId')::uuid INTO proposal_id FROM ticket_decision_history WHERE account_id=p_account_id AND idempotency_key=p_key;
 IF proposal_id IS NOT NULL THEN RETURN proposal_id; END IF;
 FOR ref IN SELECT * FROM jsonb_array_elements(p_result->'sources') LOOP
   IF NOT EXISTS(SELECT 1 FROM current_knowledge WHERE account_id=p_account_id AND id=(ref->>'version')::uuid) THEN RAISE EXCEPTION 'Knowledge changed; request a new suggestion'; END IF;
 END LOOP;
 INSERT INTO ticket_proposals(ticket_id,conversation_id,message_ids,proposed_reply,referenced_kb_articles,confidence_score,model_version,raw_llm_output,status)
 VALUES(t.id,t.conversation_id,'{}',p_proposal->>'proposed_reply',ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_proposal->'referenced_kb_articles')), (p_proposal->>'confidence_score')::float,p_proposal->>'model_version',p_proposal->'raw_llm_output','pending') RETURNING id INTO proposal_id;
 INSERT INTO ticket_decision_history(account_id,ticket_id,contract,contract_version,case_revision,status,result,actor_user_id,idempotency_key)
 VALUES(p_account_id,t.id,'reply_suggestion','1.0.0',p_revision,'proposed',p_result||jsonb_build_object('proposalId',proposal_id),p_user_id,p_key);
 RETURN proposal_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_reply_decision(uuid,uuid,uuid,bigint,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_reply_decision(uuid,uuid,uuid,bigint,jsonb,jsonb,text) TO service_role;

CREATE FUNCTION public.review_ticket_enrichment(p_account_id uuid,p_ticket_id uuid,p_user_id uuid,p_decision_id uuid,p_accept boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.tickets; d public.ticket_decision_history; v public.knowledge_versions; review_key text;
BEGIN
 PERFORM 1 FROM account_members WHERE account_id=p_account_id AND user_id=p_user_id AND status='active' AND role IN ('owner','admin','supervisor','agent') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied'; END IF;
 SELECT * INTO d FROM ticket_decision_history WHERE id=p_decision_id AND account_id=p_account_id AND ticket_id=p_ticket_id AND contract='knowledge_impact' AND status='pending_human_review';
 IF d.id IS NULL THEN RAISE EXCEPTION 'Reviewable proposal not found'; END IF;
 SELECT * INTO v FROM knowledge_versions WHERE id=d.knowledge_version_id AND account_id=p_account_id;
 IF v.source_kind='article' THEN PERFORM 1 FROM kb_articles WHERE id=v.source_id FOR SHARE;
 ELSE PERFORM 1 FROM operational_learning WHERE id=v.source_id FOR SHARE; END IF;
 SELECT * INTO t FROM tickets WHERE id=p_ticket_id AND account_id=p_account_id FOR UPDATE;
 review_key := 'review:'||d.id;
 IF EXISTS(SELECT 1 FROM ticket_decision_history WHERE account_id=p_account_id AND idempotency_key=review_key) THEN RETURN; END IF;
 SELECT * INTO v FROM current_knowledge WHERE id=d.knowledge_version_id AND account_id=p_account_id;
 IF p_accept AND (v.id IS NULL OR t.case_revision <> d.case_revision) THEN RAISE EXCEPTION 'Proposal is stale; request a current solution'; END IF;
 IF p_accept THEN UPDATE tickets SET human_modified_at=now(),knowledge_context=knowledge_context||jsonb_build_object(v.source_id::text,jsonb_build_object('versionId',v.id,'result',d.result)) WHERE id=t.id; END IF;
 INSERT INTO ticket_decision_history(account_id,ticket_id,contract,contract_version,case_revision,knowledge_version_id,status,result,actor_user_id,idempotency_key)
 VALUES(p_account_id,t.id,'knowledge_impact','1.0.0',t.case_revision,d.knowledge_version_id,CASE WHEN p_accept THEN 'approved' ELSE 'rejected' END,jsonb_build_object('reviewOf',d.id,'sources',d.result->'sources','authorization','human_review'),p_user_id,review_key);
END;
$$;
REVOKE ALL ON FUNCTION public.review_ticket_enrichment(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_ticket_enrichment(uuid,uuid,uuid,uuid,boolean) TO service_role;

CREATE VIEW public.workflow_metrics WITH (security_invoker=true) AS
SELECT h.account_id,h.contract,count(*) AS evaluations,count(DISTINCT h.ticket_id) AS tickets_evaluated,
 count(*) FILTER(WHERE h.status='pending_knowledge') AS pending_knowledge,
 count(*) FILTER(WHERE h.status='evaluated_without_contribution') AS without_contribution,
 count(*) FILTER(WHERE h.status='enriched') AS applied,
 count(*) FILTER(WHERE h.status='approved') AS accepted,
 count(*) FILTER(WHERE h.status='rejected') AS rejected,
 count(*) FILTER(WHERE h.status='pending_human_review') AS proposed,
 count(*) FILTER(WHERE h.knowledge_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM current_knowledge k WHERE k.id=h.knowledge_version_id)) AS superseded_evaluations,
 sum(c.prompt_tokens+c.completion_tokens) FILTER(WHERE h.status='evaluated_without_contribution') AS no_contribution_tokens,
 sum(c.latency_ms) FILTER(WHERE h.status='evaluated_without_contribution') AS no_contribution_latency_ms
FROM public.ticket_decision_history h LEFT JOIN public.llm_calls c ON c.id::text=h.result->>'callId' AND c.account_id=h.account_id
GROUP BY h.account_id,h.contract;
GRANT SELECT ON public.workflow_metrics TO authenticated,service_role;

CREATE VIEW public.knowledge_enrichment_coverage WITH (security_invoker=true) AS
SELECT t.account_id,
 count(*) AS total_tickets,
 count(*) FILTER(WHERE t.classification_tier=1) AS initial_tickets,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM decision_work_items w JOIN current_knowledge v ON v.id=w.knowledge_version_id WHERE w.ticket_id=t.id AND w.contract='knowledge_impact')) AS candidate_tickets,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM ticket_decision_history h JOIN current_knowledge v ON v.id=h.knowledge_version_id WHERE h.ticket_id=t.id AND h.case_revision=t.case_revision AND h.contract='knowledge_impact')) AS evaluated_current_tickets,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM jsonb_each(t.knowledge_context) ref JOIN current_knowledge v ON v.id::text=ref.value->>'versionId')) AS using_current_knowledge,
 count(*) FILTER(WHERE t.classification_tier=1 AND EXISTS(SELECT 1 FROM ticket_decision_history h WHERE h.ticket_id=t.id AND h.contract='knowledge_impact')) AS evaluated_initial_tickets,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM ticket_decision_history h WHERE h.ticket_id=t.id AND h.status IN ('approved','enriched')) AND EXISTS(SELECT 1 FROM ticket_state_history h WHERE h.ticket_id=t.id AND h.to_state='resolved' AND h.actor_type='human')) AS resolved_with_contributions
FROM public.tickets t GROUP BY t.account_id;
GRANT SELECT ON public.knowledge_enrichment_coverage TO service_role;
