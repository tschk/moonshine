const demandChecks = new Set<() => void>();
let demandCheckScheduled = false;

export function registerDemandCheck(check: () => void): () => void {
  demandChecks.add(check);
  return () => {
    demandChecks.delete(check);
  };
}

export function notifyTrackableUnsubscribe(): void {
  if (!demandChecks.size || demandCheckScheduled) return;
  demandCheckScheduled = true;
  queueMicrotask(() => {
    demandCheckScheduled = false;
    for (const check of Array.from(demandChecks)) check();
  });
}
