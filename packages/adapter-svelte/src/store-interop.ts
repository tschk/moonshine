import { createSignal, untrack } from "@tschk/moonshine";
import {
  collectDeps,
  hasValueDemand,
  isTracking,
} from "@tschk/moonshine/tracking";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { getOwner, onCleanup, type Owner } from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  recordHistory,
  trackHistoryRead,
  withHistoryMutation,
} from "./history";
import { captureRuneToStoreScope, createRuneToStoreEffect } from "./pre";
import {
  get as getStoreValue,
  writable,
  type Readable,
  type Unsubscriber,
  type Writable,
} from "./store";
import {
  notifyTrackableUnsubscribe,
  registerDemandCheck,
} from "./store-demand";
import { subscribeTo } from "./store-internal";

const trackedOwners = /* @__PURE__ */ new WeakSet<Owner>();

export function toStore<V>(get: () => V, set: (v: V) => void): Writable<V>;
export function toStore<V>(get: () => V): Readable<V>;
export function toStore<V>(
  get: () => V,
  set?: (v: V) => void,
): Writable<V> | Readable<V> {
  const captured = captureRuneToStoreScope();
  const server = isSSRRendering() || peekComponentContext()?.mode === "ssr";
  const initValue = get();
  const store = server
    ? writable(initValue)
    : writable(initValue, (setStore) => {
        if (isSSRRendering() || peekComponentContext()?.mode === "ssr") return;
        let ran = initValue !== get();
        const teardown = createRuneToStoreEffect(captured, () => {
          const value = get();
          if (ran) setStore(value);
        });
        ran = true;
        return teardown;
      });
  if (set) {
    return {
      set,
      update: (fn) => set(fn(get())),
      subscribe: store.subscribe,
    };
  }
  return {
    subscribe: store.subscribe,
  };
}

export function fromStore<V>(store: Writable<V>): { current: V };
export function fromStore<V>(store: Readable<V>): { readonly current: V };
export function fromStore<V>(
  store: Writable<V> | Readable<V>,
): { current: V } | { readonly current: V } {
  let value = undefined as V;
  let stop: Unsubscriber | undefined;
  let unregisterDemand: (() => void) | undefined;
  const version = createSignal(0);
  const versionNode = collectDeps(() => version())[0]!;
  const originalSubscribe = versionNode.subscribe;
  versionNode.subscribe = (...args) => {
    const unsubscribe = originalSubscribe(...args);
    return () => {
      unsubscribe();
      notifyTrackableUnsubscribe();
    };
  };

  function current(): V {
    if (
      !isSSRRendering() &&
      peekComponentContext()?.mode !== "ssr" &&
      isTracking() &&
      !getOwner()?.disposed
    ) {
      const owner = getOwner();
      if (owner && !trackedOwners.has(owner)) {
        trackedOwners.add(owner);
        onCleanup(notifyTrackableUnsubscribe);
      }
      version();
      trackHistoryRead(version, "value");
      if (!stop) {
        let ran = false;
        stop = untrack(() =>
          subscribeTo(store, (next) => {
            if (ran) {
              withHistoryMutation(() => {
                recordHistory(version, "value", value, next);
                value = next;
                version.set((n) => n + 1);
              });
            } else {
              value = next;
            }
          }),
        );
        ran = true;
        unregisterDemand = registerDemandCheck(() => {
          if (stop && !hasValueDemand(versionNode)) {
            const cleanup = stop;
            stop = undefined;
            unregisterDemand?.();
            unregisterDemand = undefined;
            version.set((n) => n + 1);
            untrack(() => cleanup());
          }
        });
      }
      return value;
    }
    return getStoreValue(store);
  }

  if ("set" in store) {
    return {
      get current() {
        return current();
      },
      set current(v: V) {
        store.set(v);
      },
    };
  }

  return {
    get current() {
      return current();
    },
  };
}
