import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2];
if (!['dev', 'reset', 'auth'].includes(command) || process.argv.length !== 3) {
  console.error('Usage: local-onboarding.mjs dev|reset|auth');
  process.exit(1);
}
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.error('Local development commands cannot run in a deployment.');
  process.exit(1);
}

const status = spawnSync('supabase', ['status', '--output', 'json'], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
if (status.status !== 0) {
  console.error('Supabase local is not available. Start the local stack and try again.');
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
    const response = await fetch(new URL('/auth/v1/settings', local.API_URL), { headers: { apikey: local.ANON_KEY }, signal: AbortSignal.timeout(5000) });
    const settings = await response.json();
    if (!response.ok || settings.external?.google !== true) throw new Error('Provider unavailable');
  } catch { console.error('Google did not become available in local Supabase.'); process.exit(1); }
  console.log('Google is enabled locally. The OAuth client must allow http://127.0.0.1:54321/auth/v1/callback.');
  process.exit(0);
}

try {
  const response = await fetch(new URL('/auth/v1/settings', local.API_URL), {
    headers: { apikey: local.ANON_KEY }, signal: AbortSignal.timeout(3000),
  });
  const settings = await response.json();
  if (!response.ok || settings.external?.google !== true) {
    console.error('Google sign-in is not enabled in local Supabase. Run bun run auth:local first.');
    process.exit(1);
  }
} catch {
  console.error('Unable to check local Google authentication.');
  process.exit(1);
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
