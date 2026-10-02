/**
 * Minimal keyed lock. Work for the same key runs one at a time, in arrival
 * order; work for different keys runs in parallel.
 *
 * Used to make "check for conflicts, then save" one atomic step per room,
 * which is what fixed BUG-001 (double booking). With a real database the
 * same job would be done by a transaction with SELECT ... FOR UPDATE or a
 * PostgreSQL exclusion constraint.
 */
const tails = new Map<string, Promise<void>>();

async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => current);
  tails.set(key, tail);

  await previous;
  try {
    return await work();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key); // nothing queued behind us
  }
}

/**
 * Takes several locks at once. Keys are sorted so every caller acquires them
 * in the same order, which rules out deadlocks.
 */
export function withLocks<T>(keys: string[], work: () => Promise<T>): Promise<T> {
  const sorted = [...new Set(keys)].sort();
  return sorted.reduceRight<() => Promise<T>>((inner, key) => () => withLock(key, inner), work)();
}
