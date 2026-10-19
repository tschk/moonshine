import { expect, test } from "bun:test";
import "../../react/test/dom";
import {
  createComputed,
  createDeferred,
  createEffect,
  createMemo,
  createReaction,
  createRenderEffect,
  createRoot,
  createSelector,
  createSignal,
  createUniqueId,
  For,
  from,
  observable,
  onCleanup,
  startTransition,
  useTransition,
  type EqualityCheckerFunction,
  type Observable,
  type ObservableObserver,
} from "../src/solid";
import { createMutable, modifyMutable, produce, reconcile } from "../src/store";
import { h, render } from "../src/dom";
import {
  createDeferred as serverCreateDeferred,
  createReaction as serverCreateReaction,
  createRenderEffect as serverCreateRenderEffect,
  createSelector as serverCreateSelector,
  createUniqueId as serverCreateUniqueId,
  from as serverFrom,
  h as serverH,
  observable as serverObservable,
  renderToString,
  startTransition as serverStartTransition,
  useTransition as serverUseTransition,
} from "../src/ssr";

test("createUniqueId generates deterministic tree-scoped IDs across DOM and SSR without leaking across roots", () => {
  const hostA = document.createElement("div");
  const hostB = document.createElement("div");
  const stopA = render(
    () =>
      h(
        "section",
        { id: createUniqueId() },
        h("input", { id: createUniqueId() }),
        h("label", { for: createUniqueId() }, "Name"),
      ),
    hostA,
  );
  const stopB = render(
    () =>
      h(
        "section",
        { id: createUniqueId() },
        h("input", { id: createUniqueId() }),
        h("label", { for: createUniqueId() }, "Name"),
      ),
    hostB,
  );
  const expected =
    '<section id="cl-0"><input id="cl-1"><label for="cl-2">Name</label></section>';
  expect(hostA.innerHTML.replaceAll("<!---->", "")).toBe(expected);
  expect(hostB.innerHTML.replaceAll("<!---->", "")).toBe(expected);
  expect(
    renderToString(() =>
      serverH(
        "section",
        { id: serverCreateUniqueId() },
        serverH("input", { id: serverCreateUniqueId() }),
        serverH("label", { for: serverCreateUniqueId() }, "Name"),
      ),
    ),
  ).toBe(expected);
  expect(
    renderToString(() =>
      serverH(
        "section",
        { id: serverCreateUniqueId() },
        serverH("input", { id: serverCreateUniqueId() }),
        serverH("label", { for: serverCreateUniqueId() }, "Name"),
      ),
    ),
  ).toBe(expected);
  stopA();
  stopB();

  // Ownerless fallback increments monotonically
  const firstFallback = createUniqueId();
  const secondFallback = createUniqueId();
  expect(firstFallback).toMatch(/^cl-\d+$/);
  expect(secondFallback).not.toBe(firstFallback);
});

test("createSelector notifies only entering and exiting keys, supports custom comparators, and cleans up removed subscribers", () => {
  const [selected, setSelected] = createSignal(1);
  const [items, setItems] = createSignal([1, 2, 3, 4]);
  const runs = new Map<number, number>();
  const states = new Map<number, boolean>();

  const stop = createRoot((dispose) => {
    const isSelected = createSelector(selected);
    const view = For({
      get each() {
        return items();
      },
      children: (id) => {
        createComputed(() => {
          runs.set(id, (runs.get(id) ?? 0) + 1);
          states.set(id, isSelected(id));
        });
        return id;
      },
    });
    createComputed(() => view());
    // Untracked read also works accurately
    expect(isSelected(1)).toBe(true);
    expect(isSelected(2)).toBe(false);
    return dispose;
  });

  expect([...runs.entries()]).toEqual([
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
  ]);
  expect([...states.entries()]).toEqual([
    [1, true],
    [2, 2 === 1],
    [3, false],
    [4, false],
  ]);

  // Switching from 1 -> 3 only re-runs keys 1 and 3 (O(2) instead of O(N))
  setSelected(3);
  expect([...runs.entries()]).toEqual([
    [1, 2],
    [2, 1],
    [3, 2],
    [4, 1],
  ]);
  expect(states.get(1)).toBe(false);
  expect(states.get(3)).toBe(true);

  // Removing row 3 cleans up its subscription
  setItems([1, 2, 4]);
  setSelected(1);
  expect(runs.get(3)).toBe(2);
  expect(runs.get(1)).toBe(3);
  expect(runs.get(2)).toBe(1);
  expect(runs.get(4)).toBe(1);
  stop();

  // Custom comparator (e.g. bucket / set membership)
  const [activeSet, setActiveSet] = createSignal<readonly string[]>(["a", "b"]);
  const customTrace: string[] = [];
  const compareInList: EqualityCheckerFunction<readonly string[], string> = (
    key,
    list,
  ) => list.includes(key);
  const stopCustom = createRoot((dispose) => {
    const isActive = createSelector(activeSet, compareInList);
    for (const key of ["a", "b", "c"]) {
      createComputed(() => {
        customTrace.push(`${key}:${isActive(key)}`);
      });
    }
    return dispose;
  });
  expect(customTrace).toEqual(["a:true", "b:true", "c:false"]);
  customTrace.length = 0;
  // "a" stays true, "b" becomes false, "c" becomes true -> only "b" and "c" run!
  setActiveSet(["a", "c"]);
  expect(customTrace).toEqual(["b:false", "c:true"]);
  stopCustom();

  // SSR createSelector
  const ssrHtml = renderToString(() => {
    const isSel = serverCreateSelector(() => "two");
    return serverH(
      "ul",
      null,
      ["one", "two", "three"].map((k) =>
        serverH("li", { "data-active": String(isSel(k)) }, k),
      ),
    );
  });
  expect(ssrHtml).toBe(
    '<ul><li data-active="false">one</li><li data-active="true">two</li><li data-active="false">three</li></ul>',
  );
});

test("createReaction separates tracking from one-shot invalidation and supports re-tracking", () => {
  const [a, setA] = createSignal("a0");
  const [b, setB] = createSignal("b0");
  const invalidated: string[] = [];
  const cleaned: string[] = [];
  let track!: (fn: () => void) => void;

  const stop = createRoot((dispose) => {
    track = createReaction(() => {
      // Reading signals inside onInvalidate must NOT be tracked
      invalidated.push(`inv:${a()}:${b()}`);
    });
    return dispose;
  });

  // Not triggered before track() is called
  setA("a1");
  expect(invalidated).toEqual([]);

  // First track() subscribes to `a`
  track(() => {
    a();
    onCleanup(() => cleaned.push("clean:1"));
  });
  expect(invalidated).toEqual([]);
  expect(cleaned).toEqual([]);

  // Mutating `a` triggers onInvalidate once and disposes the tracking scope
  setA("a2");
  expect(cleaned).toEqual(["clean:1"]);
  expect(invalidated).toEqual(["inv:a2:b0"]);

  // Further mutations to `a` do NOT trigger onInvalidate until track() is called again
  setA("a3");
  expect(invalidated).toEqual(["inv:a2:b0"]);

  // Re-tracking on `b`
  track(() => {
    b();
    onCleanup(() => cleaned.push("clean:2"));
  });
  setA("a4");
  expect(invalidated).toEqual(["inv:a2:b0"]);
  setB("b1");
  expect(cleaned).toEqual(["clean:1", "clean:2"]);
  expect(invalidated).toEqual(["inv:a2:b0", "inv:a4:b1"]);

  // Disposing the owner stops active tracking without firing onInvalidate
  track(() => {
    a();
    onCleanup(() => cleaned.push("clean:3"));
  });
  stop();
  expect(cleaned).toEqual(["clean:1", "clean:2", "clean:3"]);
  setA("a5");
  expect(invalidated).toEqual(["inv:a2:b0", "inv:a4:b1"]);

  // SSR createReaction is a safe no-op
  let ssrTracked = 0;
  expect(
    renderToString(() => {
      const ssrTrack = serverCreateReaction(() => {
        ssrTracked++;
      });
      ssrTrack(() => {
        ssrTracked++;
      });
      return serverH("span", null, String(ssrTracked));
    }),
  ).toBe("<span>0</span>");
});

test("createRenderEffect, observable, and from interoperate across DOM and SSR", async () => {
  const [count, setCount] = createSignal(10);
  const phases: string[] = [];

  const stop = createRoot((dispose) => {
    createEffect(() => {
      phases.push(`effect:${count()}`);
    });
    createRenderEffect((prev) => {
      const next = count();
      phases.push(`render:${prev}->${next}`);
      return next;
    }, 0);
    return dispose;
  });

  expect(phases).toEqual(["render:0->10", "effect:10"]);
  phases.length = 0;
  setCount(20);
  expect(phases).toEqual(["render:10->20", "effect:20"]);
  stop();

  // observable() and from() round-trip and custom producer cleanup
  const [source, setSource] = createSignal("alpha");
  const obs: Observable<string> = observable(source);
  const symbolKey =
    (Symbol as { observable?: symbol }).observable ?? "@@observable";
  expect((obs as any)[symbolKey]()).toBe(obs);
  expect(() =>
    obs.subscribe(null as unknown as ObservableObserver<string>),
  ).toThrow(TypeError);
  expect(obs.subscribe({}).unsubscribe()).toBeUndefined();

  const observed: string[] = [];
  let mirrored!: () => string | undefined;
  let customSignal!: () => number;
  let pushCustom!: (n: number) => void;
  let customCleaned = 0;

  const stopInterop = createRoot((dispose) => {
    obs.subscribe({
      prefix: "obs:",
      next(this: { prefix: string }, v: string) {
        observed.push(this.prefix + v);
      },
    });
    mirrored = from(obs);
    customSignal = from<number>((set) => {
      pushCustom = (n) => set(n);
      return () => {
        customCleaned++;
      };
    }, 5);
    return dispose;
  });

  expect(observed).toEqual(["obs:alpha"]);
  expect(mirrored()).toBe("alpha");
  expect(customSignal()).toBe(5);

  setSource("beta");
  expect(observed).toEqual(["obs:alpha", "obs:beta"]);
  expect(mirrored()).toBe("beta");

  pushCustom(42);
  expect(customSignal()).toBe(42);

  stopInterop();
  expect(customCleaned).toBe(1);
  setSource("gamma");
  expect(observed).toEqual(["obs:alpha", "obs:beta"]);

  // SSR createRenderEffect is a no-op while observable/from work synchronously
  let ssrRenderEffectCalls = 0;
  const ssrOut = renderToString(() => {
    serverCreateRenderEffect(() => {
      ssrRenderEffectCalls++;
    });
    const [s] = createSignal("ssr-obs");
    const derived = createMemo(() => serverFrom(serverObservable(s))());
    return serverH("p", null, derived);
  });
  expect(ssrRenderEffectCalls).toBe(0);
  expect(ssrOut).toBe("<p>ssr-obs</p>");
});

test("createDeferred returns initial value synchronously, coalesces updates asynchronously, and cancels on disposal", async () => {
  const [input, setInput] = createSignal("init");
  const seen: string[] = [];
  let deferred!: () => string;

  const stop = createRoot((dispose) => {
    deferred = createDeferred(input);
    createComputed(() => {
      seen.push(deferred());
    });
    return dispose;
  });

  // Initial value is available immediately
  expect(deferred()).toBe("init");
  expect(seen).toEqual(["init"]);

  // Rapid synchronous updates coalesce into a single microtask notification
  setInput("v1");
  setInput("v2");
  setInput("v3");
  expect(deferred()).toBe("init");
  expect(seen).toEqual(["init"]);

  await Promise.resolve();
  expect(deferred()).toBe("v3");
  expect(seen).toEqual(["init", "v3"]);

  // Disposing before flush cancels pending update
  setInput("v4");
  stop();
  await Promise.resolve();
  expect(seen).toEqual(["init", "v3"]);

  // timeoutMs option schedules via timer
  const [timedInput, setTimedInput] = createSignal(1);
  let timedDeferred!: () => number;
  const stopTimed = createRoot((dispose) => {
    timedDeferred = createDeferred(timedInput, { timeoutMs: 15 });
    return dispose;
  });
  expect(timedDeferred()).toBe(1);
  setTimedInput(2);
  expect(timedDeferred()).toBe(1);
  await new Promise((r) => setTimeout(r, 25));
  expect(timedDeferred()).toBe(2);
  stopTimed();

  // SSR createDeferred evaluates synchronously
  expect(
    renderToString(() => {
      const [s] = createSignal("ssr-deferred");
      const d = serverCreateDeferred(s);
      return serverH("span", null, d);
    }),
  ).toBe("<span>ssr-deferred</span>");
});

test("startTransition and useTransition batch synchronous updates and track async pending state", async () => {
  const [a, setA] = createSignal(1);
  const [b, setB] = createSignal(2);
  const sums: number[] = [];
  const pendingStates: boolean[] = [];

  const stop = createRoot((dispose) => {
    const [isPending] = useTransition();
    createComputed(() => {
      sums.push(a() + b());
    });
    createComputed(() => {
      pendingStates.push(isPending());
    });
    return dispose;
  });

  expect(sums).toEqual([3]);
  expect(pendingStates).toEqual([false]);

  // Synchronous transition batches writes into a single update without toggling pending
  const [, start] = useTransition();
  await start(() => {
    setA(10);
    setB(20);
  });
  expect(sums).toEqual([3, 30]);
  expect(pendingStates).toEqual([false]);

  // Async transition toggles pending to true while in flight and false when settled
  let resolveAsync!: () => void;
  const asyncPromise = startTransition(
    () =>
      new Promise<void>((resolve) => {
        setA(100);
        setB(200);
        resolveAsync = resolve;
      }),
  );
  const [isPendingNow] = useTransition();
  expect(isPendingNow()).toBe(true);
  expect(sums).toEqual([3, 30, 300]);
  expect(pendingStates).toEqual([false, true]);

  resolveAsync();
  await asyncPromise;
  expect(isPendingNow()).toBe(false);
  expect(pendingStates).toEqual([false, true, false]);
  stop();

  // SSR useTransition / startTransition
  const ssrHtml = renderToString(() => {
    const [pending] = serverUseTransition();
    void serverStartTransition(() => {});
    return serverH("b", null, () => (pending() ? "pending" : "idle"));
  });
  expect(ssrHtml).toBe("<b>idle</b>");
});

test("modifyMutable batches produce and reconcile mutations on createMutable stores", () => {
  const state = createMutable({
    user: { name: "Ada", role: "engineer" },
    items: [1, 2],
  });
  const snapshots: string[] = [];

  const stop = createRoot((dispose) => {
    createComputed(() => {
      snapshots.push(
        `${state.user.name}:${state.user.role}:${state.items.join(",")}`,
      );
    });
    return dispose;
  });

  expect(snapshots).toEqual(["Ada:engineer:1,2"]);

  // modifyMutable with produce batches multiple nested mutations into a single notification
  modifyMutable(
    state,
    produce((draft) => {
      draft.user.name = "Grace";
      draft.user.role = "architect";
      draft.items.push(3);
    }),
  );
  expect(snapshots).toEqual(["Ada:engineer:1,2", "Grace:architect:1,2,3"]);

  // modifyMutable with reconcile diffs and replaces state in a single notification
  modifyMutable(
    state,
    reconcile({
      user: { name: "Lin", role: "maintainer" },
      items: [10, 20],
    }),
  );
  expect(snapshots).toEqual([
    "Ada:engineer:1,2",
    "Grace:architect:1,2,3",
    "Lin:maintainer:10,20",
  ]);

  stop();
});
