/** Compiler-owned synchronous SSR subscriptions; completion is explicit after serialization. */
import {
  getOwner,
  onAfterDispose,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { subscribeTo } from "./store-internal";
import type { StoreSource } from "./store-binding";
export type ServerStoreReference<T> = {
  get(store: StoreSource<T> | null | undefined): T | undefined;
  releaseIfChanged<S extends StoreSource<T> | null | undefined>(store: S): S;
};
export type ServerStoreReferences = {
  create<T>(): ServerStoreReference<T>;
  finish(): void;
};
const noop = () => {};
export function createServerStoreReferences(): ServerStoreReferences {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw Error("Server store references require a live native owner");
  const accessed: Array<() => void> = [];
  let closed = false;
  function finish() {
    if (closed) return;
    closed = true;
    let failed = false,
      failure: unknown;
    for (const release of accessed.splice(0)) {
      try {
        release();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  }
  // Resource cleanup runs for failed/discarded attempts too; it is not public onDestroy.
  onAfterDispose(finish);
  return {
    finish,
    create<T>(): ServerStoreReference<T> {
      if (closed || owner.disposed)
        throw Error("Cannot create a server store reference after completion");
      let store: StoreSource<T> | null = null,
        current: T | undefined,
        seen = false,
        releasing = false,
        stop: () => void = noop;
      function release() {
        const previous = stop;
        stop = noop;
        const outer = releasing;
        releasing = true;
        try {
          previous();
        } finally {
          releasing = outer;
        }
      }
      function temporary(
        next: StoreSource<T> | null | undefined,
      ): T | undefined {
        if (next == null) return undefined;
        let value: T | undefined;
        const unsubscribe = untrack(() =>
          subscribeTo(next, (v) => (value = v)),
        );
        unsubscribe();
        return value;
      }
      return {
        releaseIfChanged(next) {
          return next;
        },
        get(next) {
          const identity = next ?? null;
          if (seen && store === identity) return current;
          // Late/new reads cannot leak subscriptions from public destroy callbacks.
          if (releasing || closed || (owner.disposed && !owner.disposing))
            return temporary(next);
          if (!seen) {
            seen = true;
            accessed.push(release);
          }
          release();
          if (closed || (owner.disposed && !owner.disposing))
            return temporary(next);
          store = identity;
          current = undefined;
          if (next) {
            let active = true,
              unsubscribe: (() => void) | undefined;
            stop = () => {
              if (!active) return;
              active = false;
              unsubscribe?.();
            };
            unsubscribe = untrack(() =>
              subscribeTo(next, (value) => {
                if (active) current = value;
              }),
            );
            if (!active || closed || (owner.disposed && !owner.disposing))
              unsubscribe();
          }
          return current;
        },
      };
    },
  };
}
