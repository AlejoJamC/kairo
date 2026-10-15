import { createHash, randomUUID } from 'node:crypto';

/** Uniform sampling without replacement; the seed and positions make a run replayable. */
export function sampleCorpus<T>(corpus: readonly T[], size: number, seed: string = randomUUID()) {
  if (!Number.isSafeInteger(size) || size < 1 || !corpus.length) throw new Error('Invalid sample size or empty corpus');
  const pool = [...corpus];
  let counter = 0;
  const integer = (bound: number) => {
    const ceiling = Math.floor(0x100000000 / bound) * bound;
    let value: number;
    do { value = createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32LE(0); } while (value >= ceiling);
    return value % bound;
  };
  for (let i = 0; i < Math.min(size, pool.length); i++) {
    const j = i + integer(pool.length - i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return { seed, requested: size, population: corpus.length, cases: pool.slice(0, size) };
}

export async function onboardingScanSize() {
  // Application configuration is shared; evaluation persistence never uses these credentials.
  process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-eval-storage';
  return (await import('../packages/env')).env.FAST_PATH_SCAN_SIZE;
}
