-- KAI-210
CREATE TABLE public.semantic_indexes (
 account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 source_kind text NOT NULL CHECK (source_kind IN ('ticket','kb_article','knowledge_version')),
 source_id uuid NOT NULL,
 revision text NOT NULL,
 preparation text NOT NULL,
 provider text NOT NULL,
 model text NOT NULL,
 dimensions integer NOT NULL CHECK(dimensions=768),
 embedding extensions.vector(768) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,source_kind,source_id)
);
CREATE INDEX semantic_indexes_vectors ON public.semantic_indexes USING hnsw(embedding extensions.vector_cosine_ops);
ALTER TABLE public.semantic_indexes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.semantic_indexes FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.semantic_indexes TO service_role;


CREATE FUNCTION public.semantic_revision(p_source jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT encode(sha256(convert_to(p_source::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION public.semantic_revision(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.semantic_revision(jsonb) TO service_role;

-- Legacy vectors intentionally have no identity record: only a new generation can establish their space.
CREATE FUNCTION public.semantic_source(p_account_id uuid,p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r jsonb; txt text; rev text; prep text; idx jsonb;
BEGIN
 IF p_kind='ticket' THEN
  SELECT to_jsonb(t) INTO r FROM tickets t WHERE id=p_id AND account_id=p_account_id;
  txt:=left(concat_ws(E'\n\n',nullif(btrim(r->>'subject'),''),nullif(btrim(coalesce(nullif(r->>'body_plain',''),r->>'snippet')),'')),1000);
  prep:='ticket:subject-body:1000:v1';
 ELSIF p_kind='kb_article' THEN
  SELECT to_jsonb(a) INTO r FROM kb_articles a WHERE id=p_id AND account_id=p_account_id;
  txt:=concat_ws(E'\n\n',nullif(btrim(r->>'title'),''),nullif(btrim(r->>'content'),''));
  prep:='article:title-content:v1';
 ELSIF p_kind='knowledge_version' THEN
  SELECT to_jsonb(v) INTO r FROM current_knowledge v WHERE id=p_id AND account_id=p_account_id;
  txt:=left(btrim(coalesce(r->'snapshot'->>'title',r->'snapshot'->'evidence'->>'title','')||E'\n'||coalesce(r->'snapshot'->>'content',r->'snapshot'->>'summary','')),2000);
  prep:='knowledge:title-body:2000:v1';
 ELSE RETURN NULL;
 END IF;
 IF r IS NULL THEN RETURN NULL; END IF;
 -- Revision includes authorization and source changes, but excludes vector writes.
 rev:=semantic_revision(CASE WHEN p_kind='ticket' THEN jsonb_build_array(r->'subject',r->'body_plain',r->'snippet')
  WHEN p_kind='kb_article' THEN jsonb_build_array(r->'title',r->'content',r->'is_published',r->'review_status')
  ELSE jsonb_build_array(r->'id',r->'revision') END);
 SELECT jsonb_build_object('revision',i.revision,'preparation',i.preparation,
  'space',jsonb_build_object('provider',i.provider,'model',i.model,'dimensions',i.dimensions),'vector',i.embedding::text::jsonb) INTO idx
 FROM semantic_indexes i WHERE account_id=p_account_id AND source_kind=p_kind AND source_id=p_id;
 RETURN jsonb_build_object('reference',jsonb_build_object('kind',p_kind,'id',p_id),'accountId',p_account_id,
  'revision',rev,'text',coalesce(txt,''),'preparation',prep,'index',idx,'input',CASE WHEN p_kind='knowledge_version' THEN r->'snapshot' WHEN p_kind='ticket' THEN jsonb_build_object('subject',r->'subject','body_plain',r->'body_plain','snippet',r->'snippet') ELSE jsonb_build_object('title',r->'title','content',r->'content') END);
END;
$$;

CREATE FUNCTION public.store_semantic_index(p_account_id uuid,p_kind text,p_id uuid,p_revision text,
 p_preparation text,p_provider text,p_model text,p_dimensions integer,p_embedding extensions.vector) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE current_source jsonb;
BEGIN
 IF p_dimensions<>768 OR vector_dims(p_embedding)<>p_dimensions THEN RAISE EXCEPTION 'Incompatible vector dimensions'; END IF;
 IF p_kind='ticket' THEN PERFORM 1 FROM tickets WHERE id=p_id AND account_id=p_account_id FOR UPDATE;
 ELSIF p_kind='kb_article' THEN PERFORM 1 FROM kb_articles WHERE id=p_id AND account_id=p_account_id FOR UPDATE;
 ELSIF p_kind='knowledge_version' THEN
  -- Serialize with publication/withdrawal, which locks the mutable source row first.
  PERFORM 1 FROM kb_articles a JOIN knowledge_versions v ON v.source_kind='article' AND v.source_id=a.id
   WHERE v.id=p_id AND v.account_id=p_account_id AND a.account_id=p_account_id FOR UPDATE OF a;
  PERFORM 1 FROM operational_learning l JOIN knowledge_versions v ON v.source_kind='learning' AND v.source_id=l.id
   WHERE v.id=p_id AND v.account_id=p_account_id AND l.account_id=p_account_id FOR UPDATE OF l;
 ELSE RETURN 'revision_changed'; END IF;
 current_source:=semantic_source(p_account_id,p_kind,p_id);
 IF current_source IS NULL OR current_source->>'revision' IS DISTINCT FROM p_revision OR current_source->>'preparation' IS DISTINCT FROM p_preparation THEN RETURN 'revision_changed'; END IF;
 INSERT INTO semantic_indexes(account_id,source_kind,source_id,revision,preparation,provider,model,dimensions,embedding)
 VALUES(p_account_id,p_kind,p_id,p_revision,p_preparation,p_provider,p_model,p_dimensions,p_embedding)
 ON CONFLICT(account_id,source_kind,source_id) DO UPDATE SET revision=EXCLUDED.revision,preparation=EXCLUDED.preparation,
  provider=EXCLUDED.provider,model=EXCLUDED.model,dimensions=EXCLUDED.dimensions,embedding=EXCLUDED.embedding,created_at=now();
 IF p_kind='ticket' THEN UPDATE tickets SET embedding=p_embedding,embedding_updated_at=now() WHERE id=p_id AND account_id=p_account_id;
 ELSIF p_kind='kb_article' THEN UPDATE kb_articles SET embedding=p_embedding WHERE id=p_id AND account_id=p_account_id;
 ELSE INSERT INTO knowledge_embeddings(version_id,account_id,embedding,source) VALUES(p_id,p_account_id,p_embedding,'semantic_service')
  ON CONFLICT(version_id) DO UPDATE SET embedding=EXCLUDED.embedding,source=EXCLUDED.source;
 END IF;
 RETURN 'indexed';
END;
$$;

CREATE FUNCTION public.retrieve_semantic_sources(p_account_id uuid,p_kind text,p_purpose text,p_query extensions.vector,
 p_provider text,p_model text,p_dimensions integer,p_ticket_id uuid DEFAULT NULL,p_threshold double precision DEFAULT 0.75,
 p_limit integer DEFAULT 12,p_status_filter text DEFAULT NULL,p_exclude_same_group boolean DEFAULT false,p_knowledge_kind text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE ticket_group uuid;
BEGIN
 IF p_query IS NULL OR p_dimensions<>768 OR vector_dims(p_query)<>p_dimensions THEN
  RETURN jsonb_build_object('status','unavailable','reason','index_incompatible','matches','[]'::jsonb); END IF;
 IF NOT ((p_kind='ticket' AND p_purpose='similar_cases') OR (p_kind IN ('kb_article','knowledge_version') AND p_purpose='approved_knowledge')) THEN
  RETURN jsonb_build_object('status','unavailable','reason','invalid_input','matches','[]'::jsonb); END IF;
 IF p_ticket_id IS NOT NULL THEN
  SELECT group_id INTO ticket_group FROM tickets WHERE id=p_ticket_id AND account_id=p_account_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable','reason','not_found','matches','[]'::jsonb); END IF;
 END IF;
 RETURN (
 WITH candidates AS NOT MATERIALIZED (
  SELECT t.id,semantic_revision(jsonb_build_array(t.subject,t.body_plain,t.snippet)) AS revision,
   'ticket:subject-body:1000:v1'::text AS preparation,NULL::uuid AS version,
   left(coalesce(t.resolution_summary,t.subject,''),4000) AS content,'historical_case'::text AS authority,
   jsonb_build_object('ticketNumber',t.ticket_number,'subject',left(t.subject,500),'resolvedAt',t.resolved_at,
    'resolutionSummary',left(t.resolution_summary,4000),'groupId',t.group_id) AS metadata,false AS linked,t.embedding IS NOT NULL AS legacy_indexed
  FROM tickets t WHERE p_kind='ticket' AND t.account_id=p_account_id AND t.id IS DISTINCT FROM p_ticket_id
   AND (p_status_filter IS NULL OR t.status=ANY(string_to_array(p_status_filter,',')))
   AND (NOT p_exclude_same_group OR ticket_group IS NULL OR t.group_id IS DISTINCT FROM ticket_group)
  UNION ALL
  SELECT v.id,semantic_revision(jsonb_build_array(v.id,v.revision)),'knowledge:title-body:2000:v1',v.id,
   left(coalesce(v.snapshot->>'content',v.snapshot->>'summary',''),4000),'approved_knowledge',
   jsonb_build_object('knowledge',jsonb_build_object('id',v.id,'account_id',v.account_id,'source_kind',v.source_kind,
    'source_id',v.source_id,'revision',v.revision,'status',v.status,'snapshot',jsonb_build_object(
     'title',left(v.snapshot->>'title',500),'content',left(v.snapshot->>'content',4000),'summary',left(v.snapshot->>'summary',4000),
     'learning_type',v.snapshot->>'learning_type','tags',v.snapshot->'tags'))),
   p_ticket_id IS NOT NULL AND coalesce(v.snapshot->'ticket_ids' @> jsonb_build_array(p_ticket_id::text),false),
   EXISTS(SELECT 1 FROM knowledge_embeddings e WHERE e.account_id=p_account_id AND e.version_id=v.id)
  FROM current_knowledge v WHERE p_kind='knowledge_version' AND v.account_id=p_account_id
   AND (p_knowledge_kind IS NULL OR v.source_kind=p_knowledge_kind)
  UNION ALL
  SELECT a.id,semantic_revision(jsonb_build_array(a.title,a.content,a.is_published,a.review_status)),
   'article:title-content:v1',NULL::uuid,left(a.content,4000),'published_article',
   jsonb_build_object('title',left(a.title,500),'tags',a.tags),false,a.embedding IS NOT NULL
  FROM kb_articles a WHERE p_kind='kb_article' AND a.account_id=p_account_id AND a.is_published
   AND NOT EXISTS(SELECT 1 FROM knowledge_versions v WHERE v.account_id=p_account_id AND v.source_kind='article' AND v.source_id=a.id)
 ), indexed AS NOT MATERIALIZED (
  SELECT c.*,i.embedding,i.source_id IS NOT NULL AS indexed,
   coalesce(i.provider=p_provider AND i.model=p_model AND i.dimensions=p_dimensions AND i.revision=c.revision AND i.preparation=c.preparation,false) AS compatible
  FROM candidates c LEFT JOIN semantic_indexes i ON i.account_id=p_account_id AND i.source_kind=p_kind AND i.source_id=c.id
 ), coverage AS (
  SELECT coalesce(bool_or(NOT indexed AND NOT legacy_indexed AND NOT linked),false) AS missing,
   coalesce(bool_or(((indexed AND NOT compatible) OR (NOT indexed AND legacy_indexed)) AND NOT linked),false) AS incompatible FROM indexed
 ), ranked AS (
  SELECT jsonb_build_object('source',jsonb_build_object('kind',p_kind,'id',id),'revision',revision,'version',version,
   'content',content,'authority',authority,'method',CASE WHEN linked THEN 'explicit_link' ELSE 'semantic' END,
   'similarity',CASE WHEN compatible THEN 1-(embedding<=>p_query) END,'metadata',metadata) AS result,
   CASE WHEN compatible THEN embedding<=>p_query END AS distance,id
  FROM indexed WHERE linked OR (compatible AND 1-(embedding<=>p_query)>=p_threshold)
  ORDER BY distance NULLS LAST,id LIMIT greatest(1,least(p_limit,50))
 ) SELECT jsonb_build_object('status',CASE WHEN missing OR incompatible THEN 'unavailable' ELSE 'ok' END,
   'reason',CASE WHEN incompatible THEN 'index_incompatible' WHEN missing THEN 'index_missing' END,
   'matches',(SELECT coalesce(jsonb_agg(result ORDER BY distance NULLS LAST,id),'[]') FROM ranked)) FROM coverage
 );
END;
$$;
REVOKE ALL ON FUNCTION public.semantic_source(uuid,text,uuid),public.store_semantic_index(uuid,text,uuid,text,text,text,text,integer,extensions.vector),
 public.retrieve_semantic_sources(uuid,text,text,extensions.vector,text,text,integer,uuid,double precision,integer,text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.semantic_source(uuid,text,uuid),public.store_semantic_index(uuid,text,uuid,text,text,text,text,integer,extensions.vector),
 public.retrieve_semantic_sources(uuid,text,text,extensions.vector,text,text,integer,uuid,double precision,integer,text,boolean,text) TO service_role;

CREATE FUNCTION public.enqueue_semantic_knowledge_candidates(p_version_id uuid, p_threshold double precision DEFAULT 0.80, p_limit integer DEFAULT 25) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, extensions AS $$
DECLARE ki public.semantic_indexes; v public.knowledge_versions; emb extensions.vector; n integer; eligible integer; unembedded integer; cap integer := greatest(1,p_limit);
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
 SELECT * INTO ki FROM semantic_indexes WHERE account_id=v.account_id AND source_kind='knowledge_version' AND source_id=v.id
  AND revision=semantic_revision(jsonb_build_array(v.id,v.revision)) AND preparation='knowledge:title-body:2000:v1';
 emb:=ki.embedding;
 -- Explicit ties always enter: the source ticket, listed tickets and tickets already using this knowledge.
 -- Everything else must be pending, carry a vector and reach the threshold; the closest ones are queued up to the cap.
 WITH explicit AS (
   SELECT t.id, t.case_revision FROM tickets t WHERE t.account_id=v.account_id AND t.merged_into_ticket_id IS NULL AND (
     v.snapshot->'ticket_ids' @> jsonb_build_array(t.id::text) OR v.snapshot->'tags' @> jsonb_build_array('origin-ticket:'||t.id) OR t.knowledge_context ? v.source_id::text)),
 nearest AS (
   SELECT t.id, t.case_revision FROM tickets t JOIN semantic_indexes ti ON ti.account_id=t.account_id AND ti.source_kind='ticket' AND ti.source_id=t.id
   AND ti.provider=ki.provider AND ti.model=ki.model AND ti.dimensions=ki.dimensions
   AND ti.revision=semantic_revision(jsonb_build_array(t.subject,t.body_plain,t.snippet)) AND ti.preparation='ticket:subject-body:1000:v1'
   WHERE emb IS NOT NULL AND t.account_id=v.account_id AND t.merged_into_ticket_id IS NULL
     AND COALESCE(t.status,'open') NOT IN ('resolved','ai_resolved','closed') AND ti.embedding IS NOT NULL
     AND 1-(ti.embedding <=> emb) >= p_threshold AND t.id NOT IN (SELECT id FROM explicit)
   ORDER BY ti.embedding <=> emb LIMIT cap)
 INSERT INTO decision_work_items(account_id,ticket_id,knowledge_version_id,contract,dedupe_key)
 SELECT v.account_id, c.id, v.id, 'knowledge_impact', 'impact:'||c.id||':'||c.case_revision||':'||v.id
 FROM (SELECT * FROM explicit UNION ALL SELECT * FROM nearest) c
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 SELECT count(*) INTO eligible FROM tickets t JOIN semantic_indexes ti ON ti.account_id=t.account_id AND ti.source_kind='ticket' AND ti.source_id=t.id
   AND ti.provider=ki.provider AND ti.model=ki.model AND ti.dimensions=ki.dimensions
   AND ti.revision=semantic_revision(jsonb_build_array(t.subject,t.body_plain,t.snippet)) AND ti.preparation='ticket:subject-body:1000:v1'
 WHERE emb IS NOT NULL AND t.account_id=v.account_id AND t.merged_into_ticket_id IS NULL
   AND COALESCE(t.status,'open') NOT IN ('resolved','ai_resolved','closed') AND ti.embedding IS NOT NULL
   AND 1-(ti.embedding <=> emb) >= p_threshold;
 SELECT count(*) INTO unembedded FROM tickets t
 WHERE t.account_id=v.account_id AND t.merged_into_ticket_id IS NULL
   AND COALESCE(t.status,'open') NOT IN ('resolved','ai_resolved','closed') AND NOT EXISTS(SELECT 1 FROM semantic_indexes ti WHERE ti.account_id=t.account_id AND ti.source_kind='ticket' AND ti.source_id=t.id AND ti.provider=ki.provider AND ti.model=ki.model AND ti.dimensions=ki.dimensions AND ti.revision=semantic_revision(jsonb_build_array(t.subject,t.body_plain,t.snippet)) AND ti.preparation='ticket:subject-body:1000:v1');
 INSERT INTO knowledge_candidate_runs(account_id,version_id,similarity_threshold,candidate_limit,eligible_tickets,selected_tickets,limit_reached,pending_without_embedding,missing_knowledge_embedding)
 VALUES (v.account_id, v.id, p_threshold, cap, eligible, n, eligible > cap, unembedded, emb IS NULL);
 RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_semantic_knowledge_candidates(uuid,double precision,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_semantic_knowledge_candidates(uuid,double precision,integer) TO service_role;

CREATE FUNCTION public.read_semantic_ticket_vectors(p_account_id uuid,p_ids uuid[],p_provider text,p_model text,p_dimensions integer)
RETURNS TABLE(id uuid,embedding extensions.vector) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT t.id,i.embedding FROM tickets t JOIN semantic_indexes i ON i.account_id=t.account_id AND i.source_kind='ticket' AND i.source_id=t.id
 WHERE t.account_id=p_account_id AND t.id=ANY(p_ids) AND cardinality(p_ids)<=200
  AND i.provider=p_provider AND i.model=p_model AND i.dimensions=p_dimensions
  AND i.revision=semantic_revision(jsonb_build_array(t.subject,t.body_plain,t.snippet)) AND i.preparation='ticket:subject-body:1000:v1';
$$;
REVOKE ALL ON FUNCTION public.read_semantic_ticket_vectors(uuid,uuid[],text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_semantic_ticket_vectors(uuid,uuid[],text,text,integer) TO service_role;
