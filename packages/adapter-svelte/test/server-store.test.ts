import { test, expect } from "bun:test";
import { createComponent } from "@tschk/moonshine-dom/component";
import {
  h,
  renderToString,
  afterRender,
  settle,
} from "@tschk/moonshine-dom/ssr";
import { createRoot, onCleanup } from "@tschk/moonshine-dom/reactive";
import { onDestroy } from "../src/svelte";
import { createStoreReference } from "../src/store-binding";
import { createServerStoreReferences } from "../src/server-store";
function source(
  trace: unknown[][],
  name: string,
  value: number,
  error?: Error,
) {
  let live = 0;
  return {
    get active() {
      return live;
    },
    subscribe(run: (v: number) => void) {
      trace.push(["start", name]);
      live++;
      run(value);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        live--;
        trace.push(["stop", name]);
        if (error) throw error;
      };
    },
  };
}
test("DOM references keep destroy-before-release while server releases at successful serialization", () => {
  const trace: unknown[][] = [];
  createRoot((stop) => {
    createComponent(
      () => {
        const store = source(trace, "dom", 1),
          ref = createStoreReference<number>();
        ref.get(store);
        onDestroy(() => trace.push(["destroy", ref.get(store)]));
        ref.finish();
      },
      {},
      "dom",
    );
    stop();
  });
  expect(trace).toEqual([
    ["start", "dom"],
    ["destroy", 1],
    ["stop", "dom"],
  ]);
  trace.length = 0;
  function App() {
    const group = createServerStoreReferences(),
      ref = group.create<number>(),
      store = source(trace, "ssr", 2);
    onDestroy(() => trace.push(["destroy", ref.get(store)]));
    return afterRender(
      h("p", null, () => ref.get(store)),
      group.finish,
    );
  }
  expect(renderToString(() => h(App, {}))).toBe("<p>2</p>");
  expect(trace).toEqual([
    ["start", "ssr"],
    ["stop", "ssr"],
    ["destroy", 2],
  ]);
});
test("first access orders cleanup, not reference declarations; peer failures drain once", () => {
  const trace: unknown[][] = [];
  const first = Error("first"),
    second = Error("second");
  let stop = () => {};
  createRoot((dispose) => {
    stop = dispose;
    const group = createServerStoreReferences(),
      a = group.create<number>(),
      b = group.create<number>();
    b.get(source(trace, "b", 2, first));
    a.get(source(trace, "a", 1, second));
    expect(() => group.finish()).toThrow(first);
    group.finish();
  });
  stop();
  expect(trace).toEqual([
    ["start", "b"],
    ["start", "a"],
    ["stop", "b"],
    ["stop", "a"],
  ]);
});
test("server assignment releases only on next read; completed cache never resubscribes", () => {
  const trace: unknown[][] = [];
  createRoot((stop) => {
    const group = createServerStoreReferences(),
      ref = group.create<number>();
    const a = source(trace, "a", 1),
      b = source(trace, "b", 2);
    expect(ref.get(a)).toBe(1);
    expect(ref.releaseIfChanged(b)).toBe(b);
    expect(trace).toEqual([["start", "a"]]);
    expect(ref.get(b)).toBe(2);
    group.finish();
    expect(ref.get(b)).toBe(2);
    expect(ref.get(b)).toBe(2);
    stop();
    expect(a.active + b.active).toBe(0);
  });
  expect(trace).toEqual([
    ["start", "a"],
    ["stop", "a"],
    ["start", "b"],
    ["stop", "b"],
  ]);
});
test("late/unread and replacement destroy reads are one-shot rather than leaking", () => {
  for (const phase of ["same", "replace", "unread"]) {
    const trace: unknown[][] = [];
    let active = 0;
    function App() {
      const group = createServerStoreReferences(),
        ref = group.create<number>(),
        a = source(trace, "a", 1),
        b = source(trace, "b", 2);
      let current = a;
      const value = phase === "unread" ? undefined : ref.get(current);
      if (phase === "replace") current = b;
      onDestroy(() => {
        trace.push(["destroy", ref.get(current)]);
        active = a.active + b.active;
      });
      return afterRender(h("p", null, value ?? "unread"), group.finish);
    }
    renderToString(() => h(App, {}));
    expect(active).toBe(0);
    expect(trace.at(-1)).toEqual(["destroy", phase === "replace" ? 2 : 1]);
    expect(trace.filter((x) => x[0] === "start").length).toBe(
      trace.filter((x) => x[0] === "stop").length,
    );
  }
});
test("discarded retries release resources but suppress public destroy; accepted request isolated", () => {
  for (let request = 0; request < 2; request++) {
    const trace: unknown[][] = [];
    let iteration = 0;
    function Child(props: { iteration: number; invalidate(): void }) {
      const group = createServerStoreReferences(),
        ref = group.create<number>(),
        store = source(trace, String(props.iteration), props.iteration);
      onCleanup(() => trace.push(["internal", props.iteration]));
      onDestroy(() => trace.push(["public", props.iteration, ref.get(store)]));
      const view = h("p", null, () => ref.get(store));
      if (props.iteration === 1) props.invalidate();
      return afterRender(view, group.finish);
    }
    function App() {
      return settle((invalidate) =>
        h(Child, { iteration: ++iteration, invalidate }),
      );
    }
    expect(renderToString(() => h(App, {}))).toBe("<p>2</p>");
    expect(trace).toEqual([
      ["start", "1"],
      ["stop", "1"],
      ["internal", 1],
      ["start", "2"],
      ["stop", "2"],
      ["internal", 2],
      ["public", 2, 2],
    ]);
  }
});
test("failed setup and failed serialization release resources, preserve primary errors", () => {
  for (const phase of ["setup", "serialize"]) {
    const trace: unknown[][] = [];
    const primary = Error(phase),
      secondary = Error("unsubscribe");
    function App() {
      const group = createServerStoreReferences(),
        ref = group.create<number>(),
        store = source(trace, phase, 3, secondary);
      ref.get(store);
      if (phase === "setup") throw primary;
      return afterRender(
        h("p", null, () => {
          throw primary;
        }),
        group.finish,
      );
    }
    expect(() => renderToString(() => h(App, {}))).toThrow(primary);
    expect(trace).toEqual([
      ["start", phase],
      ["stop", phase],
    ]);
  }
});
test("reentrant unsubscribe cannot leak a replacement subscription", () => {
  const trace: unknown[][] = [];
  createRoot((stop) => {
    const group = createServerStoreReferences(),
      ref = group.create<number>();
    const b = source(trace, "b", 2),
      c = source(trace, "c", 3);
    const a = {
      subscribe(run: (v: number) => void) {
        run(1);
        return () => {
          trace.push(["stop", "a"]);
          expect(ref.get(b)).toBe(2);
        };
      },
    };
    ref.get(a);
    expect(ref.get(c)).toBe(3);
    group.finish();
    stop();
    expect(b.active + c.active).toBe(0);
  });
  expect(trace).toEqual([
    ["stop", "a"],
    ["start", "b"],
    ["stop", "b"],
    ["start", "c"],
    ["stop", "c"],
  ]);
});

test("one latest source cache switches A-B-A and preserves first-read slot order", () => {
  const trace: unknown[][] = [];
  createRoot((stop) => {
    const group = createServerStoreReferences(),
      a = group.create<number>(),
      b = group.create<number>();
    const first = source(trace, "a", 1),
      other = source(trace, "b", 2);
    a.get(null);
    b.get(other);
    a.get(first);
    a.get(other);
    a.get(first);
    group.finish();
    expect(first.active + other.active).toBe(0);
    stop();
  });
  expect(trace).toEqual([
    ["start", "b"],
    ["start", "a"],
    ["stop", "a"],
    ["start", "b"],
    ["stop", "b"],
    ["start", "a"],
    ["stop", "a"],
    ["stop", "b"],
  ]);
});
test("literal function emissions and observable receivers are preserved; canceled callbacks cannot change cache", () => {
  createRoot((stop) => {
    const group = createServerStoreReferences(),
      ref = group.create<() => number>();
    let calls = 0,
      closed = 0;
    const value = () => ++calls;
    let emit: (value: () => number) => void = () => {};
    const subscription = {
      unsubscribe() {
        expect(this).toBe(subscription);
        closed++;
      },
    };
    const store = {
      subscribe(run: (value: () => number) => void) {
        expect(this).toBe(store);
        emit = run;
        run(() => 0);
        run(value);
        return subscription;
      },
    };
    expect(ref.get(store)).toBe(value);
    group.finish();
    emit(() => 4);
    expect(ref.get(store)).toBe(value);
    expect(calls).toBe(0);
    expect(closed).toBe(1);
    stop();
    expect(closed).toBe(1);
  });
});

test("unsubscribe failure preserves the first error while public destroy reads its completed cache", () => {
  const trace: unknown[][] = [];
  const failure = Error("unsubscribe-primary");
  function App() {
    const group = createServerStoreReferences(),
      ref = group.create<number>(),
      store = source(trace, "a", 3, failure);
    ref.get(store);
    onDestroy(() => trace.push(["destroy", ref.get(store)]));
    return afterRender(
      h("p", null, () => ref.get(store)),
      group.finish,
    );
  }
  expect(() => renderToString(() => h(App, {}))).toThrow(failure);
  expect(trace).toEqual([
    ["start", "a"],
    ["stop", "a"],
    ["destroy", 3],
  ]);
});
