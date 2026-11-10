import { afterEach, expect, it, mock } from 'bun:test';

mock.module('../../lib/auth.js', () => ({ resolveUserAndAccount: async (header: string) => header ? { userId: 'acme-agent', accountId: 'acme-account' } : null }));
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
const { assistant } = await import('./assistant');

const saved = { flag: process.env['FEATURE_FLAG_ENABLE_TICKET_ASSISTANT'], provider: process.env['TEXT_PROVIDER'], model: process.env['OLLAMA_MODEL'] };
afterEach(() => {
  for (const [name, value] of [['FEATURE_FLAG_ENABLE_TICKET_ASSISTANT', saved.flag], ['TEXT_PROVIDER', saved.provider], ['OLLAMA_MODEL', saved.model]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
const get = (auth = true) => assistant.request('/model', { headers: auth ? { Authorization: 'Bearer synthetic' } : {} });

it('names the model the assistant runs on', async () => {
  process.env['FEATURE_FLAG_ENABLE_TICKET_ASSISTANT'] = 'true';
  process.env['TEXT_PROVIDER'] = 'ollama';
  process.env['OLLAMA_MODEL'] = 'acme-local:1b';
  const response = await get();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ model: 'acme-local:1b' });
});

it('answers nothing without a session or with the assistant off', async () => {
  process.env['FEATURE_FLAG_ENABLE_TICKET_ASSISTANT'] = 'true';
  expect((await get(false)).status).toBe(401);
  process.env['FEATURE_FLAG_ENABLE_TICKET_ASSISTANT'] = 'false';
  expect((await get()).status).toBe(404);
});
