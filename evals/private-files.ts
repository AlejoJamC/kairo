import { lstat, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const privateRoot = resolve(root, 'scripts/eval/data');

export async function privatePath(path: string): Promise<string> {
  const target = resolve(path);
  const rel = relative(privateRoot, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || resolve(privateRoot, rel) !== target) throw new Error('Private path required');
  let part = root;
  for (const segment of relative(root, target).split(sep)) {
    part = resolve(part, segment);
    const stat = await lstat(part).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat?.isSymbolicLink() || (stat?.isFile() && stat.nlink !== 1)) throw new Error('Linked private path rejected');
  }
  execFileSync('git', ['check-ignore', '--quiet', '--', target], { cwd: root, stdio: 'pipe' });
  const tracked = execFileSync('git', ['ls-files', '--', target], { cwd: root, encoding: 'utf8' });
  if (tracked.trim()) throw new Error('Tracked private path rejected');
  return target;
}

export async function readPrivate(path: string) { return readFile(await privatePath(path), 'utf8'); }
export async function writePrivate(path: string, value: unknown) {
  const target = await privatePath(path);
  const rel = relative(resolve(privateRoot, 'output/evals'), target);
  const allowed = !!rel && rel !== '..' && !rel.startsWith(`..${sep}`);
  if (!allowed) throw new Error('Evaluation output path required');
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.pending-${randomUUID()}`;
  try {
    await writeFile(await privatePath(temporary), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(temporary, await privatePath(target));
  } finally { await rm(temporary, { force: true }); }
}
