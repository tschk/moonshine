import { createProps } from "@tschk/moonshine-vue/props";
import { expect, test } from "bun:test";
import {
  componentRef,
  exposeComponent,
} from "@tschk/moonshine-dom/component-instance";
import { onMounted, onUnmounted } from "@tschk/moonshine-vue/lifecycle";
import { getComponentContext } from "@tschk/moonshine-dom/component";
import { h, render } from "@tschk/moonshine-dom";
import { h as sh, renderToString } from "@tschk/moonshine-dom/ssr";
import {
  createComputed,
  createRoot,
  createSignal,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { provide, inject } from "@tschk/moonshine-vue/context";
import {
  createDOMSlotOutlet,
  createServerSlotOutlet,
  withDefaultSlot,
} from "../src/slots";
import "../../react/test/dom";
test("static slots consume child context, retain leaf state and lazily omit fallback", () => {
  let setups = 0,
    stops = 0,
    fallbacks = 0;
  const [n, set] = createSignal(0);
  function Leaf() {
    setups++;
    onCleanup(() => stops++);
    const token = inject("token");
    const [local, inc] = createSignal(0);
    return h(
      "button",
      { onClick: () => inc(local() + 1) },
      () => token + ":" + local(),
    );
  }
  function Child(raw: object) {
    provide("token", "child");
    const outlet = createDOMSlotOutlet(raw);
    return h("section", {}, () =>
      outlet(() => {
        fallbacks++;
        return h("i", {}, "fallback");
      }),
    );
  }
  function Parent() {
    provide("token", "parent");
    return h(
      withDefaultSlot(Child, () => [h("b", {}, () => n()), h(Leaf, {})]),
      {},
    );
  }
  const target = document.createElement("main");
  document.body.append(target);
  const stop = render(() => h(Parent, {}), target);
  const button = target.querySelector("button")!;
  button.click();
  button.focus();
  set(1);
  expect(target.textContent).toBe("1child:1");
  expect(target.querySelector("button")).toBe(button);
  expect(document.activeElement).toBe(button);
  expect(setups).toBe(1);
  expect(fallbacks).toBe(0);
  stop();
  expect(stops).toBe(1);
  target.remove();
});
test("SSR static slot callbacks retain current consumer and request cleanup", () => {
  let stops = 0;
  function Child(raw: object) {
    provide("token", "child");
    const outlet = createServerSlotOutlet(raw);
    return sh("section", {}, () => outlet(() => sh("i", {}, "fallback")));
  }
  function Leaf() {
    const value = inject("token");
    onCleanup(() => stops++);
    return sh("b", {}, value + "<&");
  }
  function Parent() {
    provide("token", "parent");
    return sh(
      withDefaultSlot(Child, () => sh(Leaf, {})),
      {},
    );
  }
  for (let i = 0; i < 2; i++) {
    expect(renderToString(() => sh(Parent, {}))).toBe(
      "<section><b>child&lt;&amp;</b></section>",
    );
    expect(stops).toBe(i + 1);
  }
});
test("empty static outlet evaluates fallback only once", () => {
  let calls = 0;
  function Child(raw: object) {
    const outlet = createDOMSlotOutlet(raw);
    const fallback = () => {
      calls++;
      return h("b", {}, "fallback");
    };
    return h("section", {}, () => outlet(fallback));
  }
  const target = document.createElement("main");
  const stop = render(() => h(Child, {}), target);
  expect(target.textContent).toBe("fallback");
  expect(calls).toBe(1);
  stop();
});
test("each static occurrence and component instance owns distinct content", () => {
  let leaves = 0,
    cleaned = 0;
  function Leaf() {
    const id = ++leaves;
    onCleanup(() => cleaned++);
    return h("b", {}, id);
  }
  function Child(raw: object) {
    const first = createDOMSlotOutlet(raw),
      second = createDOMSlotOutlet(raw);
    return h(
      "section",
      {},
      () => first(),
      () => second(),
    );
  }
  const target = document.createElement("main");
  const stop = render(
    () =>
      h(
        "main",
        {},
        h(
          withDefaultSlot(Child, () => h(Leaf, {})),
          {},
        ),
        h(
          withDefaultSlot(Child, () => h(Leaf, {})),
          {},
        ),
      ),
    target,
  );
  expect(
    Array.from(target.querySelectorAll("b"), (n) => n.textContent),
  ).toEqual(["1", "2", "3", "4"]);
  stop();
  expect(cleaned).toBe(4);
});
test("slot failure restores frame and drains created leaves", () => {
  let cleaned = 0;
  function Leaf() {
    onCleanup(() => cleaned++);
    return h("b", {}, "leaf");
  }
  function Child(raw: object) {
    const outlet = createDOMSlotOutlet(raw);
    return h("section", {}, () => outlet());
  }
  const target = document.createElement("main");
  expect(() =>
    render(
      () =>
        h(
          withDefaultSlot(Child, () => {
            h(Leaf, {});
            throw Error("slot-failure");
          }),
          {},
        ),
      target,
    ),
  ).toThrow("slot-failure");
  expect(cleaned).toBe(1);
  expect(target.childNodes.length).toBe(0);
});
test("a retained outlet cannot create or return DOM after consumer disposal", () => {
  let late: ReturnType<typeof createDOMSlotOutlet> | undefined,
    calls = 0;
  function Child(raw: object) {
    late = createDOMSlotOutlet(raw);
    return h("section", {}, () => late!());
  }
  const target = document.createElement("main");
  const stop = render(
    () =>
      h(
        withDefaultSlot(Child, () => {
          calls++;
          return h("b", {}, "live");
        }),
        {},
      ),
    target,
  );
  stop();
  expect(late!()).toBeUndefined();
  expect(calls).toBe(1);
  expect(target.childNodes.length).toBe(0);
});

test("wrapper forwards typed props descriptors and getter receivers within one consumer frame", () => {
  let frames: unknown[] = [];
  let source: object;
  const proto = { kind: "props" };
  source = Object.create(proto, {
    label: {
      get() {
        expect(this).toBe(source);
        return "value";
      },
      enumerable: true,
      configurable: true,
    },
  });
  function Child(raw: { label: string }) {
    const frame = getComponentContext();
    frames.push(frame);
    expect(Object.getPrototypeOf(raw)).toBe(proto);
    expect(Object.getOwnPropertyDescriptor(raw, "label")!.get).toBe(
      Object.getOwnPropertyDescriptor(source, "label")!.get,
    );
    const slot = createDOMSlotOutlet(raw);
    return h("section", {}, raw.label, () => slot());
  }
  const Wrapped = withDefaultSlot(Child, () => h("b", {}, "slot"));
  const target = document.createElement("main");
  const stop = render(() => h(Wrapped, source as { label: string }), target);
  expect(target.textContent).toBe("valueslot");
  expect(frames.length).toBe(1);
  stop();
});
test("wrapper retains native component reference publication and lifecycle scope", () => {
  let instance: { label: string } | null = null;
  const readInstance = (): { label: string } | null => instance;
  const trace: string[] = [];
  function Child(raw: { label: string }) {
    const outlet = createDOMSlotOutlet(raw);
    exposeComponent({ label: raw.label });
    onMounted(() => trace.push("mount:" + instance?.label));
    onUnmounted(() => trace.push("stop"));
    return h("section", {}, () => outlet());
  }
  const Wrapped = withDefaultSlot(Child, () => h("b", {}, "slot"));
  const target = document.createElement("main");
  const stop = render(
    () =>
      h(Wrapped, {
        label: "ready",
        [componentRef]: {
          get: () => instance,
          set: (next: { label: string } | null) => (instance = next),
          cleanup: "commit",
        },
      }),
    target,
  );
  expect(trace).toEqual(["mount:ready"]);
  expect(readInstance()?.label).toBe("ready");
  stop();
  expect(instance).toBeNull();
  expect(trace).toEqual(["mount:ready", "stop"]);
});
test("outlet caches only successful invocation and absent fallback once", () => {
  let attempts = 0;
  function Child(raw: object) {
    const outlet = createDOMSlotOutlet(raw);
    expect(() => outlet()).toThrow("first");
    const result = outlet();
    expect(outlet()).toBe(result);
    return result;
  }
  const target = document.createElement("main");
  const stop = render(
    () =>
      h(
        withDefaultSlot(Child, () => {
          if (++attempts === 1) throw Error("first");
          return h("b", {}, "retry");
        }),
        {},
      ),
    target,
  );
  expect(target.textContent).toBe("retry");
  expect(attempts).toBe(2);
  stop();
  let later = 0;
  function Empty(raw: object) {
    const outlet = createDOMSlotOutlet(raw);
    expect(outlet()).toBeUndefined();
    expect(
      outlet(() => {
        later++;
        return "late";
      }),
    ).toBeUndefined();
    return null;
  }
  const emptyStop = render(() => h(Empty, {}), target);
  expect(later).toBe(0);
  emptyStop();
});
test("early disposal skips uninitialized factories and immutable props retain receiver invariants", () => {
  let late: ReturnType<typeof createDOMSlotOutlet> | undefined,
    calls = 0;
  function Empty(raw: object) {
    late = createDOMSlotOutlet(raw);
    return null;
  }
  const target = document.createElement("main");
  const stop = render(
    () =>
      h(
        withDefaultSlot(Empty, () => {
          calls++;
          return "never";
        }),
        {},
      ),
    target,
  );
  stop();
  expect(late!()).toBeUndefined();
  expect(calls).toBe(0);
  const identity = {};
  let source: object;
  source = Object.freeze(
    Object.defineProperties(
      {},
      {
        token: {
          value: identity,
          enumerable: true,
          writable: false,
          configurable: false,
        },
        label: {
          get() {
            expect(this).toBe(source);
            return "frozen";
          },
          enumerable: true,
          configurable: false,
        },
      },
    ),
  );
  function Child(raw: { label: string; token: object }) {
    expect(raw.token).toBe(identity);
    expect(Object.getOwnPropertyDescriptor(raw, "token")!.writable).toBe(false);
    expect(Object.getOwnPropertyDescriptor(raw, "label")!.configurable).toBe(
      false,
    );
    return h("b", {}, raw.label);
  }
  const frozenStop = render(
    () =>
      h(
        withDefaultSlot(Child, () => "unused"),
        source as { label: string; token: object },
      ),
    target,
  );
  expect(target.textContent).toBe("frozen");
  frozenStop();
});
test("private slot transport stays outside declared props refresh", async () => {
  let factories = 0;
  const [label, set] = createSignal("one");
  function Child(raw: { label: string }) {
    const props = createProps(raw, ["label"]);
    expect(Object.keys(props)).toEqual(["label"]);
    expect(Object.getOwnPropertySymbols(props)).toEqual([]);
    const outlet = createDOMSlotOutlet(raw);
    return h(
      "p",
      {},
      () => props.label,
      () => outlet(),
    );
  }
  const Wrapped = withDefaultSlot(Child, () => {
    factories++;
    return h("b", {}, "slot");
  });
  const target = document.createElement("main");
  const stop = render(
    () =>
      h(Wrapped, {
        get label() {
          return label();
        },
      }),
    target,
  );
  set("two");
  await Promise.resolve();
  expect(target.textContent).toBe("twoslot");
  expect(factories).toBe(1);
  set("late");
  stop();
  await Promise.resolve();
  expect(target.childNodes.length).toBe(0);
  expect(factories).toBe(1);
});

test("failed static factory drains owned leaves before retry and preserves its primary error", () => {
  const [state, set] = createSignal(0);
  const cleaned: number[] = [],
    reads: number[] = [];
  let next = 0,
    attempt = 0;
  function Leaf() {
    const id = ++next;
    createComputed(() => {
      state();
      reads.push(id);
    });
    onCleanup(() => {
      cleaned.push(id);
      if (id === 1) throw Error("secondary-cleanup");
    });
    return h("b", {}, () => state());
  }
  function Child(raw: object) {
    const outlet = createDOMSlotOutlet(raw);
    expect(() => outlet()).toThrow("primary-factory");
    expect(cleaned).toEqual([1, 2]);
    return outlet();
  }
  const Wrapped = withDefaultSlot(Child, () => {
    if (++attempt === 1) {
      h(Leaf, {});
      h(Leaf, {});
      throw Error("primary-factory");
    }
    return h(Leaf, {});
  });
  const target = document.createElement("main");
  const stop = render(() => h(Wrapped, {}), target);
  reads.length = 0;
  set(1);
  expect(reads).toEqual([3]);
  expect(target.textContent).toBe("1");
  stop();
  expect(cleaned).toEqual([1, 2, 3]);
  set(2);
  expect(reads).toEqual([3]);
});
test("consumer disposal during a factory cancels its result and late factory calls", () => {
  let stopParent = () => {};
  let late: ReturnType<typeof createDOMSlotOutlet> | undefined,
    calls = 0,
    cleaned = 0;
  function Leaf() {
    onCleanup(() => cleaned++);
    return h("b", {}, "owned");
  }
  function Child(raw: object) {
    late = createDOMSlotOutlet(raw);
    return late();
  }
  const Wrapped = withDefaultSlot(Child, () => {
    calls++;
    h(Leaf, {});
    stopParent();
    return document.createTextNode("cancelled");
  });
  const target = document.createElement("main");
  const stop = render(
    () =>
      createRoot((dispose) => {
        stopParent = dispose;
        return h(Wrapped, {});
      }),
    target,
  );
  // Empty insertions keep their ordinary anchor until the render owner stops.
  expect(target.textContent).toBe("");
  expect(target.querySelectorAll("b").length).toBe(0);
  expect(cleaned).toBe(1);
  expect(late!()).toBeUndefined();
  expect(calls).toBe(1);
  stop();
  expect(target.childNodes.length).toBe(0);
  expect(cleaned).toBe(1);
});
