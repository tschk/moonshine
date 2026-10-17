/** Component-owned store reads; compiler owns assignments and mutation lowering. */
import {
  createSignal,
  getOwner,
  onAfterDispose,
  onCleanup,
  runWithOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { subscribeTo, changed } from "./store-internal";
import { withHistoryMutation, recordHistory, readHistory } from "./history";
export {
  setStoreValue,
  mutateStoreValue,
  updateStoreValue,
} from "./store-write";
export type StoreSource<T> = {
  subscribe(
    run: (value: T) => void,
  ): void | (() => void) | { unsubscribe(): void };
};
export type StoreReference<T> = {
  get(store: StoreSource<T> | null | undefined): T | undefined;
  releaseIfChanged<S extends StoreSource<T> | null | undefined>(store: S): S;
  /** Compiler calls this at the end of successful instance setup. */
  finish(): void;
};
const noop = () => {};
export function createStoreReference<T>(): StoreReference<T> {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw Error("Store references require a live native owner");
  let store: StoreSource<T> | null = null,
    current: T | undefined,
    stop: () => void = noop,
    closed = false,
    finished = false,
    releasing = false;
  const [version, bump] = createSignal(0);
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
  function temporary(next: StoreSource<T> | null | undefined): T | undefined {
    if (next == null) return undefined;
    let value: T | undefined;
    const unsubscribe = untrack(() => subscribeTo(next, (v) => (value = v)));
    unsubscribe();
    return value;
  }
  function close() {
    if (closed) return;
    closed = true;
    release();
  }
  // A setup exception before finish() must still release acquired subscriptions.
  onAfterDispose(close);
  return {
    get(next) {
      // Unsubscribe reads cannot replace the subscription currently being released.
      if (releasing)
        return store === (next ?? null)
          ? readHistory(version, "value", () => current)
          : temporary(next);
      if (closed || (owner.disposed && !owner.disposing)) {
        if (next == null) return current;
        return temporary(next);
      }
      if (store !== next) {
        release();
        if (closed || (owner.disposed && !owner.disposing))
          return next == null ? current : temporary(next);
        store = next ?? null;
        if (!next) current = undefined;
        else {
          let synchronous = true,
            active = true,
            unsubscribe: (() => void) | undefined;
          stop = () => {
            active = false;
            unsubscribe?.();
          };
          unsubscribe = untrack(() =>
            subscribeTo(next, (value) => {
              if (!active || closed || (owner.disposed && !owner.disposing))
                return;
              const previous = current;
              if (synchronous || !changed(previous, value)) {
                current = value;
                return;
              }
              withHistoryMutation(() => {
                recordHistory(version, "value", previous, value);
                current = value;
                if (!owner.disposed) bump((v) => v + 1);
              });
            }),
          );
          synchronous = false;
          if (!active || closed || (owner.disposed && !owner.disposing))
            unsubscribe();
        }
      }
      version();
      return readHistory(version, "value", () => current);
    },
    finish() {
      if (finished) return;
      finished = true;
      if (owner.disposed) close();
      else runWithOwner(owner, () => onCleanup(close));
    },
    releaseIfChanged(next) {
      if (store !== next) release();
      return next;
    },
  };
}
