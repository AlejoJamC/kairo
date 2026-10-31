import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2];
if (!['dev', 'start', 'reset', 'reset-wizard', 'auth'].includes(command) || process.argv.length !== 3) {
  console.error('Usage: local-onboarding.mjs dev|start|reset|reset-wizard|auth');
  process.exit(1);
}
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.error('Local development commands cannot run in a deployment.');
  process.exit(1);
}

// Supabase uses its own variable names; the applications use the shared Google OAuth credentials.
const googleClientId = process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const googleSecret = process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const authEnv = {
  ...process.env,
  ...(googleClientId && googleSecret ? {
    SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: googleClientId,
    SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: googleSecret,
  } : {}),
};

let status = spawnSync('supabase', ['status', '--output', 'json'], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
if (status.status !== 0 && (command === 'dev' || command === 'start' || command === 'auth')) {
  console.log('Starting local Supabase. Existing local data will be preserved.');
  const started = spawnSync('supabase', ['start'], { cwd: root, env: authEnv, stdio: ['ignore', 'ignore', 'inherit'] });
  if (started.error || started.status !== 0) {
    console.error('Could not start local Supabase. Check Docker and the error above.');
    process.exit(started.status || 1);
  }
  status = spawnSync('supabase', ['status', '--output', 'json'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}
if (status.error || status.status !== 0) {
  console.error('Supabase local is not available. Run bun run db:start:local and check Docker.');
  process.exit(1);
}
let local;
try {
  local = JSON.parse(status.stdout);
  const api = new URL(local.API_URL);
  const db = new URL(local.DB_URL);
  const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (!loopback.has(api.hostname) || api.protocol !== 'http:' || api.port !== '54321' ||
      api.username || api.password || api.pathname !== '/' || api.search || api.hash ||
      !loopback.has(db.hostname) || !['postgres:', 'postgresql:'].includes(db.protocol) ||
      db.port !== '54322' || db.pathname !== '/postgres' || !local.ANON_KEY || !local.SERVICE_ROLE_KEY) {
    throw new Error('Invalid local target');
  }
} catch {
  console.error('Supabase returned an invalid local target. No changes were made.');
  process.exit(1);
}

if (command === 'reset') {
  console.log('Resetting the local Supabase database on port 54322; all local data will be deleted.');
  const reset = spawnSync('supabase', ['db', 'reset', '--local', '--no-seed', '--yes'], { cwd: root, stdio: 'inherit' });
  if (reset.error || reset.status !== 0) {
    console.error('Local database reset failed. Resolve the migration error before continuing.');
    process.exit(reset.status || 1);
  }
  console.log('Local database reset complete.');
  process.exit(0);
}

if (command === 'reset-wizard') {
  const headers = { apikey: local.SERVICE_ROLE_KEY, Authorization: `Bearer ${local.SERVICE_ROLE_KEY}` };
  try {
    const updateUrl = new URL('/rest/v1/accounts', local.API_URL);
    updateUrl.searchParams.set('id', 'not.is.null');
    const update = await fetch(updateUrl, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        onboarding_completed_at: null,
        industry: null,
        business_context: null,
        business_context_source: null,
        business_context_updated_at: null,
      }), redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!update.ok) throw new Error('Account update failed');
    console.log('Local wizard reset for all accounts. Sign out and sign in again to return to the wizard.');
  } catch {
    console.error('Could not reset the local wizard.');
    process.exit(1);
  }
  process.exit(0);
}

async function googleConfigured(expectedClientId) {
  const response = await fetch(new URL('/auth/v1/settings', local.API_URL), {
    headers: { apikey: local.ANON_KEY }, signal: AbortSignal.timeout(5000),
  });
  const settings = await response.json();
  if (!response.ok || settings.external?.google !== true) return false;
  const authorize = new URL('/auth/v1/authorize', local.API_URL);
  authorize.searchParams.set('provider', 'google');
  const redirect = await fetch(authorize, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  const location = redirect.headers.get('location');
  if (!location) return false;
  const googleUrl = new URL(location);
  const clientId = googleUrl.searchParams.get('client_id');
  return googleUrl.origin === 'https://accounts.google.com' &&
    Boolean(clientId && clientId.endsWith('.apps.googleusercontent.com')) &&
    (!expectedClientId || clientId === expectedClientId);
}

if (command === 'auth') {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Run this command in an interactive terminal to enter the Google OAuth credentials.');
    process.exit(1);
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const clientId = (await prompt.question('Google OAuth client ID: ')).trim();
  prompt.close();
  if (!clientId) { console.error('A Google OAuth client ID is required.'); process.exit(1); }
  const secret = await new Promise((resolveSecret, rejectSecret) => {
    let value = '';
    process.stdin.setRawMode(true);
    process.stdout.write('Google OAuth client secret (hidden): ');
    process.stdin.resume();
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') { cleanup(); rejectSecret(new Error('Cancelled')); return; }
        if (char === '\r' || char === '\n') { cleanup(); resolveSecret(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    const cleanup = () => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    process.stdin.on('data', onData);
  }).catch(() => '');
  if (!secret) { console.error('A Google OAuth client secret is required.'); process.exit(1); }
  const authEnv = { ...process.env, SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: clientId, SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: secret };
  console.log('Restarting the Kairo Supabase services locally.');
  const stopped = spawnSync('supabase', ['stop', '--project-id', 'kairo'], { cwd: root, env: authEnv, stdio: 'ignore' });
  if (stopped.status !== 0) { console.error('Could not stop local Supabase.'); process.exit(1); }
  const started = spawnSync('supabase', ['start'], { cwd: root, env: authEnv, stdio: 'ignore' });
  if (started.status !== 0) { console.error('Could not start local Supabase with Google enabled.'); process.exit(1); }
  try {
    if (!await googleConfigured()) throw new Error('Provider unavailable');
  } catch { console.error('Google did not become available in local Supabase.'); process.exit(1); }
  console.log('Google is enabled locally. The OAuth client must allow http://127.0.0.1:54321/auth/v1/callback.');
  process.exit(0);
}

try {
  let configured = await googleConfigured(googleClientId);
  if (!configured && googleClientId && googleSecret) {
    console.log('Updating Google authentication in local Supabase; existing local data will be preserved.');
    const stopped = spawnSync('supabase', ['stop', '--project-id', 'kairo'], { cwd: root, env: authEnv, stdio: ['ignore', 'ignore', 'inherit'] });
    if (stopped.error || stopped.status !== 0) throw new Error('Could not stop local Supabase');
    const started = spawnSync('supabase', ['start'], { cwd: root, env: authEnv, stdio: ['ignore', 'ignore', 'inherit'] });
    if (started.error || started.status !== 0) throw new Error('Could not start local Supabase');
    configured = await googleConfigured(googleClientId);
  }
  if (!configured && command === 'start') {
    console.warn('Local Supabase is running, but Google authentication is not configured.');
  } else if (!configured) {
    console.error('Google sign-in is missing valid local OAuth configuration. Run bun run auth:local first.');
    process.exit(1);
  }
} catch {
  console.error('Unable to configure or check local Google authentication. Check Supabase and Docker.');
  process.exit(1);
}

if (command === 'start') {
  console.log('Local Supabase is running.');
  process.exit(0);
}

console.log('Starting Kairo against local Supabase. Open http://127.0.0.1:3000.');
const child = spawn(resolve(root, 'node_modules/.bin/turbo'), [
  'run', 'dev', '--filter=@kairo/dashboard', '--filter=@kairo/landing', '--filter=@kairo/api', '--filter=@kairo/kelan',
], {
  cwd: root, stdio: 'inherit', env: {
    ...process.env,
    NODE_ENV: 'development',
    FEATURE_FLAG_LOCAL_SUPABASE: 'true',
    LOCAL_SUPABASE_URL: local.API_URL,
    LOCAL_SUPABASE_ANON_KEY: local.ANON_KEY,
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    SUPABASE_URL: local.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
    VITE_SUPABASE_URL: local.API_URL,
    VITE_SUPABASE_ANON_KEY: local.ANON_KEY,
    VITE_API_BASE_URL: '',
    VITE_BFF_BASE_URL: '',
    VITE_LANDING_URL: 'http://127.0.0.1:3000',
    API_ORIGIN: 'http://127.0.0.1:3001',
    NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
    NEXT_PUBLIC_DASHBOARD_URL: 'http://127.0.0.1:5173/dashboard/',
    FEATURE_FLAG_ENABLE_DETECTION_UI: 'true',
    INNGEST_DEV: '1',
  },
});
child.on('error', () => { console.error('Unable to start the local development processes.'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
