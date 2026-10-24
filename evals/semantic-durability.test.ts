import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { localSupabaseTarget, createSemanticTestClient } from '../apps/api/src/test-support/local-supabase';

const target = localSupabaseTarget();
const enabled = !!target && process.env['RUN_SEMANTIC_DURABILITY'] === '1';

test.skipIf(!enabled)('an accepted indexing request survives a stopped worker and is indexed after restarting it', async () => {
  let occupied = false;
  try {
    await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(1000) });
    occupied = true;
  } catch {}
  if (occupied) throw new Error('Port 3001 is already in use; stop the existing API before running the recovery evaluation');
  const db = createSemanticTestClient(target!);
  const { requestSemanticIndexing } = await import('../apps/api/src/lib/semantic-indexing');
  const accountId = randomUUID(), ticketId = randomUUID();
  const plan = await db.from('plans').select('id').eq('code','starter').single();
  if (plan.error) throw new Error('Fixture catalog unavailable');
  const account = await db.from('accounts').insert({ id: accountId, slug: accountId, name: 'Acme', plan_id: plan.data.id });
  if (account.error) throw new Error('Fixture account unavailable');
  const ticket = await db.from('tickets').insert({ id: ticketId, account_id: accountId, subject: 'Acme access', body_plain: 'Invented access recovery instructions.' });
  if (ticket.error) throw new Error('Fixture source unavailable');
  let worker: ReturnType<typeof Bun.spawn> | undefined;
  const launch = async () => {
    worker = Bun.spawn([process.execPath, '--no-env-file', 'apps/api/src/test-support/semantic-worker-runtime.ts'], {
      env: { ...process.env, NODE_ENV: 'test', INNGEST_DEV: '1' }, stdout: 'ignore', stderr: 'ignore',
    });
    for (let i=0;i<100;i++) {
      try {
        const response = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(1000) });
        if (response.ok && (await response.json() as { runtime?: string }).runtime === 'semantic-indexing-eval') return;
      } catch {}
      if (worker.exitCode !== null) throw new Error('Local worker did not start');
      await Bun.sleep(100);
    }
    throw new Error('Worker startup timed out');
  };
  try {
    await launch();
    // Sync the actual SDK handler with the existing local durable engine.
    const sync = await fetch('http://127.0.0.1:3001/api/inngest', { method: 'PUT' });
    expect(sync.ok).toBe(true);
    await Bun.sleep(1000);
    worker!.kill(); await worker!.exited;
    const accepted = await requestSemanticIndexing(db, accountId, [{ kind: 'ticket', id: ticketId }]);
    expect(accepted.status).toBe('accepted');
    const absent = await db.from('semantic_indexes').select('source_id').eq('account_id', accountId);
    expect(absent.data).toEqual([]);
    await launch();
    for (let i=0;i<300;i++) {
      const found = await db.from('semantic_indexes').select('source_id,provider,model,dimensions').eq('account_id', accountId);
      if (found.error) throw new Error('Index query failed');
      if (found.data?.length) {
        expect(found.data).toEqual([{ source_id: ticketId, provider: 'ollama', model: 'nomic-embed-text-v2-moe', dimensions: 768 }]);
        console.log(JSON.stringify({ semanticDurability: true, storage: 'real_local_supabase',
          scheduler: 'real_local_inngest', embedding: 'real_local_ollama',
          acceptedWhileWorkerStopped: true, completedAfterWorkerRestart: true }));
        return;
      }
      await Bun.sleep(500);
    }
    throw new Error('Accepted request did not complete after worker restart');
  } finally { if (worker && worker.exitCode === null) { worker.kill(); await worker.exited; } }
}, 180_000);
