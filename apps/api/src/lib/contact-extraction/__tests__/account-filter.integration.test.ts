import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseTarget } from '../../../test-support/local-supabase.js';
import { filterCandidatesForAccount } from '../account-filter.js';
import { upsertDraftContact } from '../upsert.js';
import type { Candidate } from '../types.js';

// Runs against the local Supabase stack only, on explicit opt-in
// (RUN_SUPABASE_INTEGRATION=1). Otherwise every block is skipped.
const target = localSupabaseTarget();
const describeLocal = target ? describe : describe.skip;
const admin = target ? createClient(target.url, target.serviceRoleKey, { auth: { persistSession: false } }) : (null as never);

const FIXTURE_PLAN_CODE = 'contact-extraction-fixture';
const FIXTURE_ACCOUNT_SLUG = 'contact-extraction-fixture';
const RUN = randomUUID().slice(0, 8);

let accountId: string;
const clientIds: string[] = [];
const ticketIds: string[] = [];

function candidate(email: string, role: Candidate['evidence_role'] = 'sender'): Candidate {
  return { email, phone: null, display_name: null, organization: null, source: 'from_header', evidence_role: role };
}

beforeAll(async () => {
  if (!target) return;
  const { data: plan } = await admin.from('plans').select('id').eq('code', FIXTURE_PLAN_CODE).maybeSingle();
  let planId = plan?.id as string | undefined;
  if (!planId) {
    const { data, error } = await admin
      .from('plans')
      .insert({ code: FIXTURE_PLAN_CODE, name: 'Contact extraction fixture', seat_limit_default: 5 })
      .select('id')
      .single();
    if (error || !data) throw new Error(`failed to create fixture plan: ${error?.message}`);
    planId = data.id as string;
  }
  const { data: account } = await admin.from('accounts').select('id').eq('slug', FIXTURE_ACCOUNT_SLUG).maybeSingle();
  if (account) {
    accountId = account.id as string;
  } else {
    const { data, error } = await admin
      .from('accounts')
      .insert({ name: 'Contact extraction fixture', slug: FIXTURE_ACCOUNT_SLUG, plan_id: planId })
      .select('id')
      .single();
    if (error || !data) throw new Error(`failed to create fixture account: ${error?.message}`);
    accountId = data.id as string;
  }
});

afterAll(async () => {
  if (!target) return;
  await admin.from('draft_contact').delete().eq('account_id', accountId).like('email', `%${RUN}%`);
  if (clientIds.length) await admin.from('clients').delete().in('id', clientIds);
  if (ticketIds.length) await admin.from('tickets').delete().in('id', ticketIds);
});

async function createClientWithEmails(emails: string[]): Promise<void> {
  const { data, error } = await admin
    .from('clients')
    .insert({ account_id: accountId, internal_id: `cx-${RUN}-${randomUUID().slice(0, 6)}`, name: 'Acme', authorized_emails: emails })
    .select('id')
    .single();
  if (error || !data) throw new Error(`failed to create client: ${error?.message}`);
  clientIds.push(data.id as string);
}

async function createTicket(): Promise<string> {
  const { data, error } = await admin
    .from('tickets')
    .insert({ account_id: accountId, subject: `contact extraction ${RUN}`, status: 'open' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`failed to create ticket: ${error?.message}`);
  ticketIds.push(data.id as string);
  return data.id as string;
}

describeLocal('contact extraction — existing clients are never proposed', () => {
  it('drops sender, recipient and cc that are registered on a client, whatever their case', async () => {
    const buyer = `buyer-${RUN}@acme.com`;
    const colleague = `colleague-${RUN}@acme.com`;
    const stranger = `stranger-${RUN}@outside.com`;
    await createClientWithEmails([buyer.toUpperCase(), colleague]);

    const kept = await filterCandidatesForAccount(admin, accountId, [
      candidate(buyer, 'sender'),
      candidate(colleague, 'cc'),
      candidate(stranger, 'recipient'),
    ]);

    expect(kept.map((c) => c.email)).toEqual([stranger]);
  });

  it('creates a draft for the stranger and none for the client', async () => {
    const buyer = `buyer2-${RUN}@acme.com`;
    const stranger = `stranger2-${RUN}@outside.com`;
    await createClientWithEmails([buyer]);
    const ticketId = await createTicket();

    const kept = await filterCandidatesForAccount(admin, accountId, [candidate(buyer), candidate(stranger, 'recipient')]);
    for (const c of kept) await upsertDraftContact(admin, accountId, ticketId, c);

    const { data } = await admin.from('draft_contact').select('email').eq('account_id', accountId).like('email', `%${RUN}%`);
    const emails = (data ?? []).map((r: { email: string }) => r.email);
    expect(emails).toContain(stranger);
    expect(emails).not.toContain(buyer);
  });

  it('does not use clients of another account', async () => {
    const other = `other-${RUN}@acme.com`;
    const kept = await filterCandidatesForAccount(admin, randomUUID(), [candidate(other)]);
    expect(kept.map((c) => c.email)).toEqual([other]);
  });
});
