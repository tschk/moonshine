/** Compiler-owned const evaluation with per-evaluation cleanup and consumer context. */
import { createDerived } from "./derived";
import { getRuneConsumer } from "./pre";
import { isHistoryReading } from "./history";
import {
  withComponentConsumer,
  withComponentCleanupConsumer,
} from "@tschk/moonshine-dom/component";
import {
  createRoot,
  getOwner,
  onCleanup,
  runWithOwner,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
export function createConstDerived<T>(fn: () => T): { readonly value: T } {
  const frame = getRuneConsumer();
  const parent = getOwner();
  if (!parent || parent.disposed || !frame || frame.owner.disposed)
    throw Error("Const requires a live consumer");
  let stop: (() => void) | undefined;
  const release = () => {
    const previous = stop;
    stop = undefined;
    previous?.();
  };
  onCleanup(release);
  return createDerived(() => {
    if (isHistoryReading()) return withComponentCleanupConsumer(frame, fn);
    release();
    let evaluation!: Owner;
    createRoot((dispose) => {
      stop = dispose;
      evaluation = getOwner()!;
    });
    try {
      return runWithOwner(evaluation, () => withComponentConsumer(frame, fn));
    } catch (error) {
      try {
        release();
      } catch {
        /* Preserve the computation failure after disposing owned work. */
      }
      throw error;
    }
  });
}
