import { describe, expect, it } from 'bun:test';
import { identifySender, type DirectoryClient, type DirectoryContact } from './client-identity';

const client = (id: string, emails: string[]): DirectoryClient => ({ id, plan_type: 'Pro', sla_level: 'Standard', authorized_emails: emails });
const contact = (id: string, email: string, status: DirectoryContact['status'], organization: string | null = 'Outside'): DirectoryContact =>
  ({ id, email, display_name: 'Synthetic Person', organization, status });
const directory = [client('acme', ['Support@Acme.com']), client('outside', ['ops@outside.com', 'billing@outside.com'])];

describe('identifySender', () => {
  it('verifies an authorized address regardless of case or display name', () => {
    expect(identifySender('"Acme Support" <support@ACME.com>', directory))
      .toMatchObject({ clientId: 'acme', authority: 'authorized', candidateClientId: null });
  });

  it('chooses no client when two clients list the same address', () => {
    expect(identifySender('shared@acme.com', [client('a', ['shared@acme.com']), client('b', ['shared@acme.com'])]))
      .toMatchObject({ clientId: null, authority: 'ambiguous', candidateClientId: null });
  });

  it('reports a corporate domain match as a candidate without linking the client', () => {
    expect(identifySender('new.person@outside.com', directory))
      .toMatchObject({ clientId: null, authority: 'same_domain', candidateClientId: 'outside' });
  });

  it('does not infer a company from a free mail provider', () => {
    expect(identifySender('someone@gmail.com', [client('gmail-user', ['other@gmail.com'])]))
      .toMatchObject({ clientId: null, authority: 'unknown', candidateClientId: null, sender: { email: 'someone@gmail.com', organization: null } });
  });

  it('returns no identity for a missing or invalid sender', () => {
    expect(identifySender(null, directory)).toMatchObject({ authority: 'unknown', sender: null, contact: null });
    expect(identifySender('not-an-email', directory)).toMatchObject({ authority: 'unknown', sender: null });
  });
});

describe('identifySender with the contact pipeline', () => {
  it('always names the sender as the potential client, even with no record anywhere', () => {
    expect(identifySender('client@outside.com', [], [], 'Synthetic Sender')).toMatchObject({
      authority: 'unknown', contact: null,
      sender: { email: 'client@outside.com', displayName: 'Synthetic Sender', organization: 'Outside' },
    });
  });

  it('marks a human-confirmed contact as verified without inventing a client or a contract', () => {
    expect(identifySender('client@outside.com', [], [contact('contact-1', 'Client@Outside.com', 'confirmed', 'Outside Logistics')])).toMatchObject({
      clientId: null, authority: 'unknown',
      contact: { id: 'contact-1', status: 'confirmed', organization: 'Outside Logistics' },
      sender: { organization: 'Outside Logistics' },
    });
  });

  it('keeps a proposed contact as declared and ignores a rejected one', () => {
    expect(identifySender('client@outside.com', [], [contact('contact-2', 'client@outside.com', 'proposed')]).contact)
      .toEqual({ id: 'contact-2', status: 'proposed', organization: 'Outside' });
    expect(identifySender('client@outside.com', [], [contact('contact-3', 'client@outside.com', 'rejected')]).contact).toBeNull();
  });

  it('reports the client contract and the contact together when both exist', () => {
    expect(identifySender('ops@outside.com', directory, [contact('contact-4', 'ops@outside.com', 'confirmed')]))
      .toMatchObject({ clientId: 'outside', authority: 'authorized', contact: { id: 'contact-4', status: 'confirmed' } });
  });
});
