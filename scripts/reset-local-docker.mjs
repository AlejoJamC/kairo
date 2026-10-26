import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

if (process.argv.length !== 2 || process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.error('This command is only available for interactive local development.');
  process.exit(1);
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run this command in an interactive terminal.');
  process.exit(1);
}

function docker(args, capture = false) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error || result.status !== 0) {
    console.error(`Docker command failed: docker ${args[0]}. Cleanup stopped.`);
    process.exit(result.status || 1);
  }
  return result.stdout?.trim() ?? '';
}

const hostOverride = process.env.DOCKER_HOST;
const endpoint = hostOverride || docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], true);
if (!endpoint.startsWith('unix://') && !endpoint.startsWith('npipe://')) {
  console.error('Refusing cleanup: Docker must use a local Unix socket or named pipe.');
  process.exit(1);
}

console.log('WARNING: This deletes ALL containers, volumes, images, unused networks and build cache in this local Docker engine.');
console.log('This includes local databases and observability data from Kairo and other projects. Bind-mounted files are not removed.');
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question('Type DELETE ALL LOCAL DOCKER to continue: ');
prompt.close();
if (answer !== 'DELETE ALL LOCAL DOCKER') {
  console.log('Cleanup cancelled.');
  process.exit(1);
}

const containers = docker(['container', 'ls', '--all', '--quiet'], true).split('\n').filter(Boolean);
if (containers.length) docker(['container', 'rm', '--force', ...containers]);
const volumes = docker(['volume', 'ls', '--quiet'], true).split('\n').filter(Boolean);
if (volumes.length) docker(['volume', 'rm', '--force', ...volumes]);
docker(['system', 'prune', '--all', '--force']);
docker(['builder', 'prune', '--all', '--force']);
console.log('Local Docker cleanup complete. Run bun run db:start:local to start Supabase again.');
