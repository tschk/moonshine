import { expect, test } from "bun:test";
import { createSignal } from "@tschk/moonshine";
import { createRenderEffect, createRoot } from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { createDerived } from "../src/derived";
import { createRuneEffect } from "../src/effect";
import {
  createRunePreEffect,
  flushRuneWork,
  withRuneScheduler,
} from "../src/pre";
import {
  derived,
  fromStore,
  get,
  readable,
  readonly,
  toStore,
  writable,
  type Readable,
} from "../src/store";
import { tick } from "../src/svelte";

const SVELTE_STORE_CLIENT_PATH =
  "../../../examples/svelte-adopt/node_modules/svelte/src/store/index-client.js";
const SVELTE_STORE_SERVER_PATH =
  "../../../examples/svelte-adopt/node_modules/svelte/src/store/index-server.js";
const SVELTE_INTERNAL_CLIENT_PATH =
  "../../../examples/svelte-adopt/node_modules/svelte/src/internal/client/index.js";
const SVELTE_INDEX_CLIENT_PATH =
  "../../../examples/svelte-adopt/node_modules/svelte/src/index-client.js";

test("toStore exposes readable and writable contracts and observes pre-subscribe state changes", () => {
  const count = createSignal(1);
  const readOnly = toStore(() => count());
  expect("set" in readOnly).toBe(false);
  expect("update" in readOnly).toBe(false);

  const rw = toStore(
    () => count(),
    (next) => count.set(next),
  );
  expect("set" in rw).toBe(true);
  expect("update" in rw).toBe(true);

  // Mutating underlying state before first subscribe must still emit the new value on subscribe.
  count.set(4);
  const values: number[] = [];
  const stop = createRoot((dispose) => {
    let unsub!: () => void;
    withRuneScheduler(() => {
      unsub = rw.subscribe((v) => values.push(v));
    });
    return () => {
      unsub();
      dispose();
    };
  });
  expect(values).toEqual([4]);

  rw.set(7);
  flushRuneWork();
  expect(values).toEqual([4, 7]);

  rw.update((n) => n + 5);
  flushRuneWork();
  expect(values).toEqual([4, 7, 12]);
  expect(get(readOnly)).toBe(12);

  stop();
});

test("toStore survives enclosing component root disposal while external subscribers remain active", () => {
  const count = createSignal(10);
  let store!: ReturnType<typeof toStore<number>>;
  const disposeComponent = createRoot((dispose) => {
    withRuneScheduler(() => {
      store = toStore(() => count());
    });
    return dispose;
  });

  const seen: number[] = [];
  const unsubscribe = store.subscribe((value) => seen.push(value));
  expect(seen).toEqual([10]);

  disposeComponent();
  count.set(20);
  flushRuneWork();
  expect(seen).toEqual([10, 20]);

  unsubscribe();
  count.set(30);
  flushRuneWork();
  expect(seen).toEqual([10, 20]);
});

test("fromStore preserves readable vs writable descriptors, untrack one-shot reads, and observable interop", async () => {
  let starts = 0,
    stops = 0;
  const w = writable(5, () => {
    starts++;
    return () => {
      stops++;
    };
  });
  const ro = readonly(w);

  const fromW = fromStore(w);
  const fromRo = fromStore(ro);
  expect("set" in Object.getOwnPropertyDescriptor(fromW, "current")!).toBe(
    true,
  );
  expect(
    Object.getOwnPropertyDescriptor(fromRo, "current")?.set,
  ).toBeUndefined();

  // Outside tracking: one-shot get(store) starts and immediately stops the store.
  expect(fromW.current).toBe(5);
  expect([starts, stops]).toEqual([1, 1]);

  fromW.current = 9;
  expect(fromRo.current).toBe(9);
  expect([starts, stops]).toEqual([2, 2]);

  // Custom observable with { unsubscribe() } object contract.
  let obsOpens = 0,
    obsCloses = 0;
  let emitObs!: (value: string) => void;
  const observable = {
    subscribe(run: (value: string) => void) {
      obsOpens++;
      emitObs = run;
      run("alpha");
      return {
        unsubscribe() {
          obsCloses++;
        },
      };
    },
  } as unknown as Readable<string>;

  const fromObs = fromStore(observable);
  const observed: string[] = [];
  const dispose = createRoot((stop) => {
    withRuneScheduler(() => {
      createRenderEffect(() => {
        observed.push(fromObs.current);
      });
    });
    return stop;
  });

  expect(observed).toEqual(["alpha"]);
  expect([obsOpens, obsCloses]).toEqual([1, 0]);

  emitObs("beta");
  flushRuneWork();
  expect(observed).toEqual(["alpha", "beta"]);

  dispose();
  expect(obsCloses).toBe(0);
  await Promise.resolve();
  expect(obsCloses).toBe(1);
});

test("fromStore shares one subscription across chained deriveds and disconnects/reconnects on microtask demand", async () => {
  let starts = 0,
    stops = 0;
  const source = writable(10, () => {
    starts++;
    return () => {
      stops++;
    };
  });
  const bridged = fromStore(source);
  const enabled = createSignal(true);
  const log: number[] = [];

  const dispose = createRoot((stop) => {
    withRuneScheduler(() => {
      const plusOne = createDerived(() => bridged.current + 1);
      const doubled = createDerived(() => plusOne.value * 2);
      createRenderEffect(() => {
        log.push(enabled() ? doubled.value : -1);
      });
      createRuneEffect(() => {
        if (enabled()) void plusOne.value;
      });
    });
    return stop;
  });

  await tick();
  expect(log).toEqual([22]);
  expect([starts, stops]).toEqual([1, 0]);

  source.set(20);
  await tick();
  expect(log).toEqual([22, 42]);
  expect([starts, stops]).toEqual([1, 0]);

  // Disconnecting all reactive readers tears down the store subscription after a microtask.
  enabled.set(false);
  flushRuneWork();
  expect(log).toEqual([22, 42, -1]);
  expect([starts, stops]).toEqual([1, 0]);
  await Promise.resolve();
  expect([starts, stops]).toEqual([1, 1]);

  // Updating the store while disconnected must still invalidate deriveds when reconnected.
  source.set(30);
  enabled.set(true);
  await tick();
  expect(log).toEqual([22, 42, -1, 62]);
  expect([starts, stops]).toEqual([2, 1]);

  dispose();
  await Promise.resolve();
  expect([starts, stops]).toEqual([2, 2]);
});

test("toStore and fromStore on SSR perform one-shot reads without reactive subscriptions", () => {
  let starts = 0;
  const backing = writable(3, () => {
    starts++;
    return () => {};
  });
  const count = createSignal(7);

  withSSRRendering(() => {
    const asStore = toStore(
      () => count(),
      (next) => count.set(next),
    );
    const seen: number[] = [];
    const unsub = asStore.subscribe((value) => seen.push(value));
    count.set(11);
    flushRuneWork();
    expect(seen).toEqual([7]);
    asStore.update((n) => n + 1);
    expect(count()).toBe(12);
    unsub();

    const asState = fromStore(backing);
    expect(asState.current).toBe(3);
    asState.current = 8;
    expect(asState.current).toBe(8);
    expect(starts).toBe(2);
  });
});

test("differential parity against Svelte 5.57.1 client and server store interop", async () => {
  const svelteStoreClient = (await import(SVELTE_STORE_CLIENT_PATH)) as {
    writable: typeof writable;
    readable: typeof readable;
    derived: typeof derived;
    readonly: typeof readonly;
    get: typeof get;
    toStore: typeof toStore;
    fromStore: typeof fromStore;
  };
  const svelteStoreServer = (await import(SVELTE_STORE_SERVER_PATH)) as {
    writable: typeof writable;
    toStore: typeof toStore;
    fromStore: typeof fromStore;
    get: typeof get;
  };
  const $ = (await import(SVELTE_INTERNAL_CLIENT_PATH)) as any;
  const { flushSync } = (await import(SVELTE_INDEX_CLIENT_PATH)) as {
    flushSync: (fn?: () => void) => void;
  };

  function runSvelteScenario() {
    const modes: Record<string, string[]> = {};
    for (const mode of [
      "initial-in-pre",
      "second-run-in-pre",
      "initial-in-render",
      "two-stores-in-pre",
    ]) {
      const log: string[] = [];
      const stop = $.effect_root(() => {
        const count = $.state(0);
        const s1 = svelteStoreClient.toStore(() => $.get(count));
        const s2 = svelteStoreClient.toStore(() => $.get(count) * 10);
        let u1: (() => void) | undefined;
        let u2: (() => void) | undefined;
        $.user_pre_effect(() => {
          const c = $.get(count);
          log.push(`pre:${c}`);
          if (mode === "initial-in-pre" && !u1) {
            u1 = s1.subscribe((v) => log.push(`s1:${v}`));
          }
          if (mode === "second-run-in-pre" && c === 1 && !u1) {
            u1 = s1.subscribe((v) => log.push(`s1:${v}`));
          }
          if (mode === "two-stores-in-pre" && !u1) {
            u1 = s1.subscribe((v) => log.push(`s1:${v}`));
            u2 = s2.subscribe((v) => log.push(`s2:${v}`));
          }
        });
        $.render_effect(() => {
          const c = $.get(count);
          log.push(`render:${c}`);
          if (mode === "initial-in-render" && !u1) {
            u1 = s1.subscribe((v) => log.push(`s1:${v}`));
          }
        });
        flushSync(() => $.set(count, 1));
        flushSync(() => $.set(count, 2));
        u1?.();
        u2?.();
      });
      stop();
      modes[mode] = log;
    }

    const cleanupLog: string[] = [];
    const stopCleanup = $.effect_root(() => {
      const s = svelteStoreClient.writable(1);
      const fs = svelteStoreClient.fromStore(s);
      const d = $.derived(() => fs.current * 10);
      $.user_pre_effect(() => {
        cleanupLog.push(`run:${fs.current}:${$.get(d)}`);
        return () => {
          cleanupLog.push(`cleanup:${fs.current}:${$.get(d)}`);
        };
      });
      flushSync(() => s.set(2));
    });
    stopCleanup();

    let serverVal = 5;
    const srvStore = svelteStoreServer.toStore(
      () => serverVal,
      (v) => {
        serverVal = v;
      },
    );
    const srvSeen: number[] = [];
    const srvUnsub = srvStore.subscribe((v) => srvSeen.push(v));
    serverVal = 9;
    srvStore.update((n) => n + 1);
    srvUnsub();
    const srvFrom = svelteStoreServer.fromStore(svelteStoreServer.writable(4));
    const srvFromInitial = srvFrom.current;
    srvFrom.current = 11;

    return JSON.stringify({
      modes,
      cleanupLog,
      server: {
        srvSeen,
        serverVal,
        srvFromInitial,
        srvFromAfter: srvFrom.current,
      },
    });
  }

  function runMoonshineScenario() {
    const modes: Record<string, string[]> = {};
    for (const mode of [
      "initial-in-pre",
      "second-run-in-pre",
      "initial-in-render",
      "two-stores-in-pre",
    ]) {
      const log: string[] = [];
      createRoot((stop) => {
        let count!: ReturnType<typeof createSignal<number>>;
        let u1: (() => void) | undefined;
        let u2: (() => void) | undefined;
        withRuneScheduler(() => {
          count = createSignal(0);
          const s1 = toStore(() => count());
          const s2 = toStore(() => count() * 10);
          createRunePreEffect(() => {
            const c = count();
            log.push(`pre:${c}`);
            if (mode === "initial-in-pre" && !u1) {
              u1 = s1.subscribe((v) => log.push(`s1:${v}`));
            }
            if (mode === "second-run-in-pre" && c === 1 && !u1) {
              u1 = s1.subscribe((v) => log.push(`s1:${v}`));
            }
            if (mode === "two-stores-in-pre" && !u1) {
              u1 = s1.subscribe((v) => log.push(`s1:${v}`));
              u2 = s2.subscribe((v) => log.push(`s2:${v}`));
            }
          });
          createRenderEffect(() => {
            const c = count();
            log.push(`render:${c}`);
            if (mode === "initial-in-render" && !u1) {
              u1 = s1.subscribe((v) => log.push(`s1:${v}`));
            }
          });
        });
        count.set(1);
        flushRuneWork();
        count.set(2);
        flushRuneWork();
        u1?.();
        u2?.();
        stop();
      });
      modes[mode] = log;
    }

    const cleanupLog: string[] = [];
    createRoot((stop) => {
      let s!: ReturnType<typeof writable<number>>;
      withRuneScheduler(() => {
        s = writable(1);
        const fs = fromStore(s);
        const d = createDerived(() => fs.current * 10);
        createRunePreEffect(() => {
          cleanupLog.push(`run:${fs.current}:${d.value}`);
          return () => {
            cleanupLog.push(`cleanup:${fs.current}:${d.value}`);
          };
        });
      });
      s.set(2);
      flushRuneWork();
      stop();
    });

    let serverVal = 5;
    let srvSeen: number[] = [];
    let srvFromInitial = 0;
    let srvFromAfter = 0;
    withSSRRendering(() => {
      const srvStore = toStore(
        () => serverVal,
        (v) => {
          serverVal = v;
        },
      );
      const srvUnsub = srvStore.subscribe((v) => srvSeen.push(v));
      serverVal = 9;
      srvStore.update((n) => n + 1);
      srvUnsub();
      const srvFrom = fromStore(writable(4));
      srvFromInitial = srvFrom.current;
      srvFrom.current = 11;
      srvFromAfter = srvFrom.current;
    });

    return JSON.stringify({
      modes,
      cleanupLog,
      server: {
        srvSeen,
        serverVal,
        srvFromInitial,
        srvFromAfter,
      },
    });
  }

  expect(runMoonshineScenario()).toBe(runSvelteScenario());
});
