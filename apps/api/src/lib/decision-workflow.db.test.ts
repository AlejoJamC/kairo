import { afterAll, describe, expect, it } from 'bun:test';
import { SQL } from 'bun';
import { randomUUID } from 'node:crypto';

// Explicit opt-in; this suite only connects to the disposable local test database.
const enabled = process.env['RUN_WORKFLOW_DB_TESTS'] === '1';
const sql = new SQL('postgresql://postgres:test-only-password@127.0.0.1:55494/postgres?sslmode=disable');
afterAll(async () => { await sql.close(); });

async function fixture() {
  const account = randomUUID(), user = randomUUID(), ticket = randomUUID(), article = randomUUID();
  await sql`INSERT INTO auth.users(id,email) VALUES(${user},${`${user}@acme.com`})`;
  await sql`INSERT INTO accounts(id,name,slug,plan_id) SELECT ${account},'Acme',${account},id FROM plans LIMIT 1`;
  await sql`INSERT INTO account_members(account_id,user_id,role) VALUES(${account},${user},'agent')`;
  await sql`INSERT INTO tickets(id,account_id,subject,body_plain,classification_tier,assigned_to,priority,model_verdict) VALUES(${ticket},${account},'Acme access recovery','Reset access to the Acme account.',1,${user},'P2','{"urgency":"medium"}')`;
  await sql`INSERT INTO kb_articles(id,account_id,title,content,is_published) VALUES(${article},${account},'Access recovery','Reset access to the Acme account.',false)`;
  const version = async () => (await sql`SELECT id FROM latest_knowledge WHERE source_id=${article}`)[0].id as string;
  const approve = async () => { await sql`SELECT review_workflow_knowledge(${account},${user},'article',${article},${await version()},'approved')`; return version(); };
  const enrich = async (id: string, key: string = randomUUID(), revision = 0, useful = true) => (await sql`SELECT record_ticket_enrichment(${account},${ticket},${revision},${id},'{}',${useful},${key}) AS status`)[0].status as string;
  return { account,user,ticket,article,version,approve,enrich };
}

describe.skipIf(!enabled)('decision workflow database guarantees', () => {
  it('keeps inferred knowledge out of retrieval until an active agent approves it', async () => {
    const f = await fixture();
    expect(await sql`SELECT id FROM find_workflow_knowledge(${f.account},'access recovery',${f.ticket})`).toHaveLength(0);
    const approved = await f.approve();
    expect((await sql`SELECT id FROM find_workflow_knowledge(${f.account},'access recovery',${f.ticket})`)[0].id).toBe(approved);
    expect((await sql`SELECT actor_user_id FROM knowledge_versions WHERE id=${approved}`)[0].actor_user_id).toBe(f.user);
  });
  it('rejects stale reviews and revoked membership', async () => {
    const f = await fixture(), original = await f.version();
    await f.approve();
    await expect(sql`SELECT review_workflow_knowledge(${f.account},${f.user},'article',${f.article},${original},'rejected')`.execute()).rejects.toThrow('Knowledge changed');
    await sql`UPDATE account_members SET status='suspended' WHERE account_id=${f.account}`;
    await expect(f.approve()).rejects.toThrow('Permission denied');
  });
  it('selects a relevant initial ticket without reingesting or touching an unrelated ticket', async () => {
    const f = await fixture(), version = await f.approve(), unrelated = randomUUID();
    await sql`INSERT INTO tickets(id,account_id,subject,body_plain) VALUES(${unrelated},${f.account},'Bananas','Fruit delivery')`;
    await sql`SELECT enqueue_knowledge_candidates(${version})`;
    await sql`SELECT enqueue_knowledge_candidates(${version})`;
    const jobs = await sql`SELECT ticket_id FROM decision_work_items WHERE account_id=${f.account} AND contract='knowledge_impact'`;
    expect(jobs).toHaveLength(1); expect(jobs[0].ticket_id).toBe(f.ticket);
    expect(await f.enrich(version, 'same-evaluation')).toBe('enriched');
    expect(await f.enrich(version, 'same-evaluation')).toBe('already_evaluated');
    expect(await sql`SELECT id FROM ticket_decision_history WHERE account_id=${f.account} AND contract='knowledge_impact'`).toHaveLength(1);
  });
  it('records no contribution without applying a knowledge version', async () => {
    const f = await fixture(), version = await f.approve();
    expect(await f.enrich(version, 'irrelevant', 0, false)).toBe('evaluated_without_contribution');
    expect((await sql`SELECT knowledge_context FROM tickets WHERE id=${f.ticket}`)[0].knowledge_context).toEqual({});
  });
  it('protects a human view that arrives while evaluation is running', async () => {
    const f = await fixture(), version = await f.approve();
    await sql`SELECT mark_ticket_viewed(${f.account},${f.ticket},${f.user})`;
    expect(await f.enrich(version)).toBe('pending_human_review');
    expect((await sql`SELECT knowledge_context FROM tickets WHERE id=${f.ticket}`)[0].knowledge_context).toEqual({});
  });
  it('rejects a result computed against an earlier case revision', async () => {
    const f = await fixture(), version = await f.approve();
    await sql`UPDATE tickets SET body_plain='New information' WHERE id=${f.ticket}`;
    expect(await f.enrich(version)).toBe('stale_case');
  });
  it('does not let an old knowledge event erase a newer applied version', async () => {
    const f = await fixture(), old = await f.approve();
    await f.enrich(old);
    await sql`SELECT review_workflow_knowledge(${f.account},${f.user},'article',${f.article},${old},'approved',NULL,'Reset account access using the current recovery procedure.')`;
    const latest = await f.version(); await f.enrich(latest);
    await sql`SELECT enqueue_knowledge_candidates(${old})`;
    expect((await sql`SELECT knowledge_context FROM tickets WHERE id=${f.ticket}`)[0].knowledge_context[f.article].versionId).toBe(latest);
    expect(await f.enrich(old)).toBe('stale_knowledge');
  });
  it('withdraws current references while preserving their immutable application history', async () => {
    const f = await fixture(), version = await f.approve(); await f.enrich(version);
    await sql`SELECT review_workflow_knowledge(${f.account},${f.user},'article',${f.article},${version},'rejected')`;
    await sql`SELECT enqueue_knowledge_candidates(${await f.version()})`;
    expect((await sql`SELECT knowledge_context FROM tickets WHERE id=${f.ticket}`)[0].knowledge_context).toEqual({});
    expect(await sql`SELECT id FROM ticket_decision_history WHERE ticket_id=${f.ticket} AND status='enriched'`).toHaveLength(1);
    expect(await sql`SELECT id FROM ticket_decision_history WHERE ticket_id=${f.ticket} AND result ? 'withdrawnVersion'`).toHaveLength(1);
  });
  it('rechecks a withdrawal after waiting for a concurrent replacement to commit', async () => {
    const f = await fixture(), approved = await f.approve();
    await sql`SELECT review_workflow_knowledge(${f.account},${f.user},'article',${f.article},${approved},'rejected')`;
    const withdrawn = await f.version(), connection = await sql.reserve();
    try {
      await connection`BEGIN`;
      await connection`SELECT review_workflow_knowledge(${f.account},${f.user},'article',${f.article},${withdrawn},'approved')`;
      const latest = (await connection`SELECT id FROM current_knowledge WHERE source_id=${f.article}`)[0].id;
      await connection`SELECT record_ticket_enrichment(${f.account},${f.ticket},0,${latest},'{}',true,'replacement')`;
      const staleWithdrawal = sql`SELECT enqueue_knowledge_candidates(${withdrawn})`.execute();
      expect(await Promise.race([staleWithdrawal.then(() => true),Bun.sleep(30).then(() => false)])).toBe(false);
      await connection`COMMIT`;
      await staleWithdrawal;
      expect((await sql`SELECT knowledge_context FROM tickets WHERE id=${f.ticket}`)[0].knowledge_context[f.article].versionId).toBe(latest);
    } finally { await connection`ROLLBACK`; connection.release(); }
  });
  it('prevents updates, deletes and truncation of decision and knowledge history', async () => {
    const f = await fixture();
    await expect(sql`UPDATE knowledge_versions SET snapshot='{}' WHERE source_id=${f.article}`.execute()).rejects.toThrow('append-only');
    await expect(sql`DELETE FROM ticket_decision_history WHERE ticket_id=${f.ticket}`.execute()).rejects.toThrow('append-only');
    await expect(sql`TRUNCATE ticket_decision_history`.execute()).rejects.toThrow('append-only');
  });
  it('queues a new inbound email on an onboarding ticket without replaying onboarding', async () => {
    const f = await fixture(), channel = randomUUID(), initial = randomUUID(), incoming = randomUUID();
    await sql`INSERT INTO channel_integrations(id,account_id,provider,external_account_id) VALUES(${channel},${f.account},'gmail','support@acme.com')`;
    await sql`INSERT INTO messages(id,account_id,channel_integration_id,direction,received_at,processing_tier) VALUES(${initial},${f.account},${channel},'inbound',now(),1),(${incoming},${f.account},${channel},'inbound',now(),NULL)`;
    await sql`INSERT INTO ticket_messages(ticket_id,message_id) VALUES(${f.ticket},${initial}),(${f.ticket},${incoming})`;
    const jobs = await sql`SELECT contract,message_id FROM decision_work_items WHERE ticket_id=${f.ticket}`;
    expect(jobs).toHaveLength(1); expect(jobs[0]).toMatchObject({ contract:'incoming_email_decision', message_id:incoming });
  });
  it('holds enrichment behind a concurrent human view and then proposes instead of applying', async () => {
    const f = await fixture(), version = await f.approve();
    const connection = await sql.reserve();
    try {
      await connection`BEGIN`;
      await connection`SELECT mark_ticket_viewed(${f.account},${f.ticket},${f.user})`;
      const enriching = f.enrich(version);
      const completedEarly = await Promise.race([enriching.then(() => true), Bun.sleep(30).then(() => false)]);
      expect(completedEarly).toBe(false);
      await connection`COMMIT`;
      expect(await enriching).toBe('pending_human_review');
    } finally { await connection`ROLLBACK`; connection.release(); }
  });
  it('protects explicit human assignment even when it matches the automatic assignee', async () => {
    const f = await fixture(), version = await f.approve();
    await sql`UPDATE tickets SET assigned_to=${f.user},human_modified_at=now() WHERE id=${f.ticket}`;
    expect(await f.enrich(version,'after-assignment',1)).toBe('pending_human_review');
  });
  it('approves a contribution atomically and records exactly one human review', async () => {
    const f = await fixture(), version = await f.approve();
    await sql`SELECT mark_ticket_viewed(${f.account},${f.ticket},${f.user})`;
    await f.enrich(version,'reviewable');
    const decision = (await sql`SELECT id FROM ticket_decision_history WHERE ticket_id=${f.ticket} AND idempotency_key='reviewable'`)[0].id;
    await sql`SELECT review_ticket_enrichment(${f.account},${f.ticket},${f.user},${decision},true)`;
    await sql`SELECT review_ticket_enrichment(${f.account},${f.ticket},${f.user},${decision},true)`;
    expect(await sql`SELECT id FROM ticket_decision_history WHERE ticket_id=${f.ticket} AND status='approved'`).toHaveLength(1);
    expect((await sql`SELECT knowledge_context FROM tickets WHERE id=${f.ticket}`)[0].knowledge_context[f.article].versionId).toBe(version);
  });
  it('stores a reply and its exact current sources in one idempotent transaction', async () => {
    const f = await fixture(), version = await f.approve();
    const proposal = { proposed_reply:'Please use the current recovery procedure.', referenced_kb_articles:[f.article],confidence_score:0.8,model_version:'test-model',raw_llm_output:{} };
    const result = { sources:[{id:f.article,version,kind:'article'}],authorization:'human_review' };
    const save = async () => (await sql`SELECT save_reply_decision(${f.account},${f.ticket},${f.user},0,${proposal}::jsonb,${result}::jsonb,'reply-test') AS id`)[0].id;
    expect(await save()).toBe(await save());
    expect(await sql`SELECT id FROM ticket_proposals WHERE ticket_id=${f.ticket}`).toHaveLength(1);
    await sql`SELECT review_workflow_knowledge(${f.account},${f.user},'article',${f.article},${version},'rejected')`;
    await expect(sql`SELECT save_reply_decision(${f.account},${f.ticket},${f.user},0,${proposal}::jsonb,${result}::jsonb,'new-reply')`.execute()).rejects.toThrow('Knowledge changed');
    expect(await sql`SELECT id FROM ticket_proposals WHERE ticket_id=${f.ticket}`).toHaveLength(1);
  });
  it('denies client writes to immutable history and access to the work queue', async () => {
    const [permissions] = await sql`SELECT
      has_table_privilege('authenticated','knowledge_versions','INSERT') AS insert_knowledge,
      has_table_privilege('authenticated','ticket_decision_history','TRUNCATE') AS truncate_history,
      has_table_privilege('authenticated','decision_work_items','SELECT') AS read_queue,
      has_sequence_privilege('authenticated','knowledge_versions_revision_seq','USAGE') AS advance_version,
      has_function_privilege('authenticated','review_workflow_knowledge(uuid,uuid,text,uuid,uuid,text,text,text)','EXECUTE') AS review_directly`;
    expect(Object.values(permissions)).toEqual([false,false,false,false,false]);
  });

  it('separates current coverage from cumulative evaluations and unknown costs', async () => {
    const f = await fixture(), version = await f.approve();
    await sql`SELECT enqueue_knowledge_candidates(${version})`;
    await f.enrich(version,'without-contribution',0,false);
    const [coverage] = await sql`SELECT * FROM knowledge_enrichment_coverage WHERE account_id=${f.account}`;
    expect(Number(coverage.initial_tickets)).toBe(1);
    expect(Number(coverage.candidate_tickets)).toBe(1);
    expect(Number(coverage.evaluated_current_tickets)).toBe(1);
    expect(Number(coverage.using_current_knowledge)).toBe(0);
    const [metrics] = await sql`SELECT * FROM workflow_metrics WHERE account_id=${f.account} AND contract='knowledge_impact'`;
    expect(Number(metrics.without_contribution)).toBe(1);
    expect(metrics.no_contribution_tokens).toBeNull();
  });

  describe('work queue reliability', () => {
    async function isolatedQueue() {
      const f = await fixture();
      // The queue and the breaker are global: park other accounts' items and reset the breaker.
      await sql`UPDATE decision_work_items SET available_at=now()+interval '1 day' WHERE account_id<>${f.account} AND status IN ('pending','running')`;
      await sql`DELETE FROM decision_work_items WHERE account_id=${f.account}`;
      await sql`DELETE FROM decision_work_outcomes`;
      await sql`UPDATE decision_work_breaker SET level=0, open_until=NULL, half_open=false, changed_at=now()`;
      const add = async (contract: string, key: string, createdAgo = '0 minutes', attempts = 0) =>
        (await sql`INSERT INTO decision_work_items(account_id,contract,dedupe_key,created_at,available_at,attempts)
          VALUES(${f.account},${contract},${key},now()-${createdAgo}::interval,now()-${createdAgo}::interval,${attempts}) RETURNING id`)[0].id as string;
      const claim = async (limit = 10) => sql`SELECT * FROM claim_decision_work(${limit},6) WHERE account_id=${f.account}`;
      const release = async (id: string, retriable = true, consume = true) =>
        (await sql`SELECT release_decision_work(${id},'ProviderError: outage',${retriable},${consume},6) AS s`)[0].s as string;
      const item = async (id: string) => (await sql`SELECT status,attempts,available_at>now() AS deferred,last_error,
        extract(epoch FROM available_at-first_failed_at)::integer AS offset_seconds FROM decision_work_items WHERE id=${id}`)[0];
      const outcome = async (ok: boolean, outage: boolean) => (await sql`SELECT record_decision_outcome(${ok},${outage}) AS s`)[0].s as string;
      const breaker = async () => (await sql`SELECT level,half_open,extract(epoch FROM open_until-now())::integer AS seconds_left FROM decision_work_breaker`)[0];
      const due = async (id?: string) => {
        if (id) await sql`UPDATE decision_work_items SET available_at=now() WHERE id=${id}`;
        await sql`UPDATE decision_work_breaker SET open_until=now()-interval '1 second' WHERE open_until IS NOT NULL`;
      };
      return { f, add, claim, release, item, outcome, breaker, due };
    }

    it('claims incoming mail before an older historical backlog and counts the attempt', async () => {
      const q = await isolatedQueue();
      await q.add('historical_learning', 'history-1', '2 hours');
      await q.add('historical_learning', 'history-2', '1 hour');
      const incoming = await q.add('incoming_email_decision', 'incoming-1');
      const [first] = await q.claim(1);
      expect(first.id).toBe(incoming);
      expect(first.attempts).toBe(1);
    });

    it('retries at 1 min, 5 min, 15 min, 3 h and 6 h after the first failure, then fails', async () => {
      const q = await isolatedQueue();
      const id = await q.add('incoming_email_decision', 'ladder');
      const offsets = [];
      for (let retry = 1; retry <= 5; retry++) {
        await q.claim();
        expect(await q.release(id)).toBe('pending');
        offsets.push((await q.item(id)).offset_seconds);
        await q.due(id);
      }
      expect(offsets).toEqual([60, 300, 900, 10800, 21600]);
      await q.claim();
      expect(await q.release(id)).toBe('failed');
    });

    it('moves an item whose last allowed attempt never completed to failed instead of retrying it forever', async () => {
      const q = await isolatedQueue();
      const poison = await q.add('incoming_email_decision', 'poison', '1 hour', 6);
      expect(await q.claim()).toHaveLength(0);
      expect(await q.item(poison)).toMatchObject({ status: 'failed', last_error: 'attempts_exhausted' });
    });

    it('fails a permanent error at once', async () => {
      const q = await isolatedQueue();
      const permanent = await q.add('incoming_email_decision', 'permanent');
      await q.claim();
      expect(await q.release(permanent, false)).toBe('failed');
      expect(await q.claim()).toHaveLength(0);
    });

    it('does not spend an attempt on a deployment fault', async () => {
      const q = await isolatedQueue();
      const item = await q.add('incoming_email_decision', 'configuration', '0 minutes', 4);
      await q.claim();
      expect(await q.release(item, true, false)).toBe('pending');
      expect(await q.item(item)).toMatchObject({ status: 'pending', attempts: 4, deferred: true });
    });

    it('requeues failed items only for an active owner and keeps the last error', async () => {
      const q = await isolatedQueue();
      const failed = await q.add('incoming_email_decision', 'requeue-me', '1 hour', 6);
      await q.claim();
      const [{ user_id: agent }] = await sql`SELECT user_id FROM account_members WHERE account_id=${q.f.account}`;
      await expect(sql`SELECT requeue_failed_decision_work(${q.f.account},${agent})`.execute()).rejects.toThrow('Permission denied');
      await sql`UPDATE account_members SET role='owner' WHERE account_id=${q.f.account} AND user_id=${agent}`;
      expect((await sql`SELECT requeue_failed_decision_work(${q.f.account},${agent}) AS n`)[0].n).toBe(1);
      expect(await q.item(failed)).toMatchObject({ status: 'pending', attempts: 0, last_error: 'attempts_exhausted' });
    });

    it('does not open the breaker below ten executions or below 80% outage failures', async () => {
      let q = await isolatedQueue();
      for (let i = 0; i < 9; i++) expect(await q.outcome(false, true)).toBe('closed');
      q = await isolatedQueue();
      for (let i = 0; i < 7; i++) expect(await q.outcome(false, true)).toBe('closed');
      expect(await q.outcome(true, false)).toBe('closed');
      expect(await q.outcome(true, false)).toBe('closed');
      expect(await q.outcome(true, false)).toBe('closed');
      expect(await q.outcome(false, true)).toBe('closed');
    });

    it('opens the breaker at exactly ten executions with 80% outage failures', async () => {
      const q = await isolatedQueue();
      for (let i = 0; i < 8; i++) expect(await q.outcome(false, true)).toBe('closed');
      expect(await q.outcome(true, false)).toBe('closed');
      expect(await q.outcome(true, false)).toBe('open');
    });

    it('holds the whole queue 15 min after a mass outage, then 3 h and 6 h while probes keep failing', async () => {
      const q = await isolatedQueue();
      for (let i = 0; i < 4; i++) await q.add('incoming_email_decision', `outage-${i}`);
      for (let i = 0; i < 9; i++) await q.outcome(false, true);
      expect(await q.outcome(false, true)).toBe('open');
      expect(await q.breaker()).toMatchObject({ level: 1, half_open: false });
      expect((await q.breaker()).seconds_left).toBeGreaterThan(890);
      expect(await q.claim()).toHaveLength(0);
      await q.due();
      expect(await q.claim()).toHaveLength(3);
      expect(await q.claim()).toHaveLength(0);
      expect(await q.outcome(false, true)).toBe('open');
      expect(await q.breaker()).toMatchObject({ level: 2 });
      expect((await q.breaker()).seconds_left).toBeGreaterThan(10790);
      await q.due();
      await q.claim();
      expect(await q.outcome(false, true)).toBe('open');
      expect(await q.breaker()).toMatchObject({ level: 3 });
      expect((await q.breaker()).seconds_left).toBeGreaterThan(21590);
    });

    it('closes the breaker on the first successful probe', async () => {
      const q = await isolatedQueue();
      await q.add('incoming_email_decision', 'probe');
      for (let i = 0; i < 10; i++) await q.outcome(false, true);
      await q.due();
      await q.claim();
      expect(await q.outcome(true, false)).toBe('closed');
      expect(await q.breaker()).toMatchObject({ level: 0, half_open: false, seconds_left: null });
    });

    it('fails items still failing six hours after their first failure when the last probe fails', async () => {
      const q = await isolatedQueue();
      const old = await q.add('incoming_email_decision', 'six-hours');
      const fresh = await q.add('incoming_email_decision', 'never-failed');
      await sql`UPDATE decision_work_items SET first_failed_at=now()-interval '7 hours', attempts=5 WHERE id=${old}`;
      await sql`UPDATE decision_work_breaker SET level=3, half_open=true, open_until=now()+interval '20 minutes', changed_at=now()`;
      expect(await q.outcome(false, true)).toBe('open');
      expect(await q.item(old)).toMatchObject({ status: 'failed', last_error: 'outage_exceeded_retry_window' });
      expect(await q.item(fresh)).toMatchObject({ status: 'pending' });
    });
  });
});
