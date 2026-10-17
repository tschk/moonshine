/** Svelte teardown reads use the first values preceding the current flush. */
import { getOwner, type Owner } from "@tschk/moonshine-dom/reactive";
export type HistoryRead = { target: object; key: PropertyKey };
let values = new Map<object, Map<PropertyKey, unknown>>();
let historical = new Map<object, unknown>();
let scheduledEpoch: number | undefined;
let epoch = 0,
  holds = 0,
  mutationDepth = 0;
let cleanupOwner: Owner | null | undefined;
const collectors: HistoryRead[][] = [];
function clear(): void {
  values.clear();
  historical.clear();
  epoch++;
}
function schedule(): void {
  if (holds || (!values.size && !historical.size) || scheduledEpoch === epoch)
    return;
  const expected = epoch;
  scheduledEpoch = expected;
  queueMicrotask(() => {
    if (scheduledEpoch === expected) scheduledEpoch = undefined;
    if (expected === epoch && !holds && !mutationDepth) clear();
  });
}
export function holdHistory(): void {
  holds++;
}
export function releaseHistory(): void {
  if (!holds) throw new Error("Unbalanced history release");
  if (--holds === 0 && !mutationDepth) clear();
}
export function withHistoryMutation<T>(fn: () => T): T {
  mutationDepth++;
  try {
    return fn();
  } finally {
    if (--mutationDepth === 0) schedule();
  }
}
export function isHistoryReading(): boolean {
  return cleanupOwner !== undefined && cleanupOwner === getOwner();
}
export function withHistoryCleanup<T>(fn: () => T): T {
  const previous = cleanupOwner;
  cleanupOwner = getOwner();
  try {
    return fn();
  } finally {
    cleanupOwner = previous;
    if (cleanupOwner === undefined && !mutationDepth) schedule();
  }
}
export function recordHistory(
  target: object,
  key: PropertyKey,
  before: unknown,
  after: unknown,
): void {
  let entries = values.get(target);
  if (!entries) values.set(target, (entries = new Map()));
  if (isHistoryReading()) entries.set(key, after);
  else if (!entries.has(key)) entries.set(key, before);
}
export function trackHistoryRead(target: object, key: PropertyKey): void {
  for (const collector of collectors)
    if (!collector.some((read) => read.target === target && read.key === key))
      collector.push({ target, key });
}
export function readHistory<T>(
  target: object,
  key: PropertyKey,
  live: () => T,
): T {
  trackHistoryRead(target, key);
  const entries = values.get(target);
  return isHistoryReading() && entries?.has(key)
    ? (entries.get(key) as T)
    : live();
}
export function collectHistoryReads<T>(fn: () => T): {
  value: T;
  reads: HistoryRead[];
} {
  const reads: HistoryRead[] = [];
  collectors.push(reads);
  try {
    return { value: fn(), reads };
  } finally {
    collectors.pop();
  }
}
export function hasHistory(reads: readonly HistoryRead[]): boolean {
  return reads.some(
    ({ target, key }) => values.get(target)?.has(key) || historical.has(target),
  );
}
export function historicalValue<T>(token: object, compute: () => T): T {
  if (historical.has(token)) return historical.get(token) as T;
  const value = compute();
  historical.set(token, value);
  return value;
}
