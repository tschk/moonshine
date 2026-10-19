/** Private coordination of the optional rune queues; no kernel scheduling policy. */
const pending = /* @__PURE__ */ new Map<() => void, () => void>();

export function queueTickWork(run: () => void, cancel: () => void): void {
  pending.set(run, cancel);
}
export function removeTickWork(run: () => void): void {
  pending.delete(run);
}
export function hasPendingTickWork(): boolean {
  return pending.size > 0;
}
export function drainTickWork(): void {
  const counts = new Map<() => void, number>();
  let failed = false,
    failure: unknown;
  while (pending.size) {
    const [run, cancel] = pending.entries().next().value!;
    pending.delete(run);
    const count = (counts.get(run) ?? 0) + 1;
    counts.set(run, count);
    try {
      if (count > 1000) {
        if (!failed) failure = Error("Native tick update limit exceeded");
        failed = true;
        cancel();
      } else run();
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
  }
  if (failed) throw failure;
}
