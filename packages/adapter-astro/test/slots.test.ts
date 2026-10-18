import { expect, test } from "bun:test";
import { getOwner, onCleanup } from "@tschk/moonshine-dom/reactive";
import {
  h,
  boundary,
  renderToString,
  sourceComponent,
  sourceSlot,
  sourceHasSlot,
  type SourceSlots,
} from "../src/ssr";

test("slot presence distinguishes missing from empty and ignores inherited names", () => {
  const Layout = (_props: object, slots: SourceSlots) =>
    h("section", null, sourceSlot(slots, "default", "fallback"));
  expect(renderToString(() => sourceComponent(Layout, {}))).toBe(
    "<section>fallback</section>",
  );
  expect(
    renderToString(() => sourceComponent(Layout, {}, { default: () => false })),
  ).toBe("<section></section>");
  expect(renderToString(() => sourceSlot({}, "toString", "missing"))).toBe(
    "missing",
  );
  expect(
    renderToString(() => sourceComponent(Layout, {}, { default: () => "<&" })),
  ).toBe("<section>&lt;&amp;</section>");
});

test("slot channel preserves ordinary children/slots props, identity and snapshot timing", () => {
  const payload = {};
  const callback = () => {};
  const trace: string[] = [];
  const props = {
    children: "ordinary child",
    slots: "ordinary slots",
    payload,
    callback,
    get label() {
      trace.push("prop");
      return "label";
    },
  };
  function Layout(actual: typeof props, slots: SourceSlots) {
    trace.push("setup");
    expect(Object.keys(actual).sort()).toEqual(Object.keys(props).sort());
    expect(actual.payload).toBe(payload);
    expect(actual.callback).toBe(callback);
    expect(actual.children).toBe("ordinary child");
    expect(actual.slots).toBe("ordinary slots");
    return h("p", null, actual.label, sourceSlot(slots));
  }
  expect(
    renderToString(() => {
      const child = sourceComponent(Layout, props, {
        default: () => {
          trace.push("slot");
          return "body";
        },
      });
      trace.push("constructed");
      return child;
    }),
  ).toBe("<p>labelbody</p>");
  expect(trace).toEqual(["prop", "constructed", "setup", "slot"]);
});

test("unused slots stay lazy and repeated outlets render their content each time", () => {
  let used = 0,
    unused = 0;
  const Layout = (_props: object, slots: SourceSlots) =>
    h("p", null, sourceSlot(slots), sourceSlot(slots));
  expect(
    renderToString(() =>
      sourceComponent(
        Layout,
        {},
        {
          default: () => ++used,
          unused: () => {
            unused++;
            return "unused";
          },
        },
      ),
    ),
  ).toBe("<p>12</p>");
  expect(unused).toBe(0);
});

test("slot content retains caller ownership and can forward through nested components", () => {
  const key = Symbol("slot context");
  const Inner = (_props: object, slots: SourceSlots) =>
    h("article", null, sourceSlot(slots, "title"));
  function Layout(_props: object, slots: SourceSlots) {
    getOwner()!.context.set(key, "layout");
    return sourceComponent(
      Inner,
      {},
      { title: () => sourceSlot(slots, "title") },
    );
  }
  function Parent() {
    getOwner()!.context.set(key, "parent");
    return sourceComponent(
      Layout,
      {},
      {
        title: () => {
          expect(getOwner()!.context.get(key)).toBe("parent");
          return h("b", null, "title");
        },
      },
    );
  }
  expect(renderToString(() => h(Parent, {}))).toBe(
    "<article><b>title</b></article>",
  );
});

test("fallback expressions evaluate at construction while fallback components stay deferred", () => {
  const trace: string[] = [];
  const Fallback = () => {
    trace.push("fallback component");
    return "unused";
  };
  const Layout = (_props: object, slots: SourceSlots) => {
    trace.push("fallback expression");
    return sourceSlot(slots, "default", [
      "fallback",
      sourceComponent(Fallback, {}),
    ]);
  };
  expect(
    renderToString(() =>
      sourceComponent(Layout, {}, { default: () => "supplied" }),
    ),
  ).toBe("supplied");
  expect(trace).toEqual(["fallback expression"]);
});

test("special slot names remain own values and async content rejects explicitly", () => {
  const Layout = (_props: object, slots: SourceSlots) =>
    sourceSlot(slots, "__proto__");
  expect(
    renderToString(() =>
      sourceComponent(Layout, {}, { ["__proto__"]: () => "safe" }),
    ),
  ).toBe("safe");
  expect(() =>
    renderToString(() =>
      sourceComponent(
        Layout,
        {},
        {
          ["__proto__"]: () => Promise.reject(Error("async")) as never,
        },
      ),
    ),
  ).toThrow("Async Astro children");
});

test("one component invocation initializes once when its output is serialized twice", () => {
  let calls = 0;
  expect(
    renderToString(() => {
      const child = sourceComponent(() => {
        calls++;
        return h("b", null, "once");
      }, {});
      return [child, child];
    }),
  ).toBe("<b>once</b><b>once</b>");
  expect(calls).toBe(1);
});

test("failed component initialization is cached and cleans up before boundary fallback", () => {
  const trace: string[] = [];
  expect(
    renderToString(() => {
      const child = sourceComponent(() => {
        trace.push("setup");
        onCleanup(() => trace.push("cleanup"));
        throw Error("failed");
      }, {});
      const fallback = () => {
        trace.push("fallback");
        return "recovered";
      };
      return [boundary(() => child, fallback), boundary(() => child, fallback)];
    }),
  ).toBe("recoveredrecovered");
  expect(trace).toEqual(["setup", "cleanup", "fallback", "fallback"]);
});

test("slot presence queries are own-key checks and never evaluate supplied content", () => {
  let calls = 0;
  const inherited = { inherited: "parent" };
  const slots = Object.create(inherited) as Record<string, unknown>;
  Object.defineProperty(slots, "head", {
    enumerable: true,
    get() {
      calls++;
      throw new Error("content read");
    },
  });
  slots.empty = undefined;
  expect(sourceHasSlot(slots as SourceSlots, "head")).toBe(true);
  expect(sourceHasSlot(slots as SourceSlots, "empty")).toBe(true);
  expect(sourceHasSlot(slots as SourceSlots, "missing")).toBe(false);
  expect(sourceHasSlot(slots as SourceSlots, "inherited")).toBe(false);
  expect(sourceHasSlot(slots as SourceSlots, "toString")).toBe(false);
  expect(calls).toBe(0);
});
