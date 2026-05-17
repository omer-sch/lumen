// Tiny semaphore for capping the number of in-flight async tasks.
//
// We use this instead of a p-limit dep because:
//   (a) the call site is a single file (templates/weekly-review-globalcomix.ts),
//   (b) keeping the implementation in the repo makes the behaviour
//       reviewable in one place, and
//   (c) it is 30 lines, including the type definitions.
//
// The shape mirrors p-limit so swapping in the npm package later is
// a one-line import change.

export type Limit = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Build a concurrency-limiting wrapper. Calls beyond `max` are queued
 * and resumed in FIFO order as in-flight tasks resolve. Rejections
 * propagate to the caller (they do not block the queue from draining).
 */
export function createLimit(max: number): Limit {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`createLimit: max must be a positive integer, got ${max}`);
  }
  let active = 0;
  const queue: Array<() => void> = [];
  const pump = () => {
    if (active >= max) return;
    const next = queue.shift();
    if (!next) return;
    active += 1;
    next();
  };
  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        Promise.resolve()
          .then(fn)
          .then(
            (v) => {
              active -= 1;
              resolve(v);
              pump();
            },
            (err) => {
              active -= 1;
              reject(err);
              pump();
            },
          );
      };
      queue.push(run);
      pump();
    });
}
