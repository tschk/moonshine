import { test, expect } from "bun:test";
import { boundary, h, defer, renderToString } from "@tschk/moonshine-dom/ssr";
import { onCleanup } from "@tschk/moonshine-dom/reactive";
import { onDestroy } from "../src/svelte";
const boom = new Error("render");
const fail = () => {
  throw boom;
};
test("discarded lifecycle suppressed, accepted request cleanup once", () => {
  const trace: string[] = [];
  function Child({ name }: { name: string }) {
    onDestroy(() => trace.push(name));
    onCleanup(() => trace.push("internal:" + name));
    return h("b", null, name);
  }
  for (let i = 0; i < 2; i++)
    expect(
      renderToString(() =>
        boundary(
          () => [h(Child, { name: "discard" }), defer(fail)],
          () => h(Child, { name: "accept" }),
        ),
      ),
    ).toBe("<b>accept</b>");
  expect(trace).toEqual([
    "internal:discard",
    "accept",
    "internal:accept",
    "internal:discard",
    "accept",
    "internal:accept",
  ]);
});
test("nested accepted public teardown is suppressed when outer attempt fails", () => {
  const trace: string[] = [];
  function Child() {
    onDestroy(() => trace.push("public"));
    onCleanup(() => trace.push("internal"));
    return h("b");
  }
  expect(
    renderToString(() =>
      boundary(
        () => [boundary(() => h(Child, {}), fail), defer(fail)],
        () => "safe",
      ),
    ),
  ).toBe("safe");
  expect(trace).toEqual(["internal"]);
});
test("accepted public destruction errors do not rerender fallback", () => {
  let calls = 0;
  function Child() {
    onDestroy(() => {
      throw boom;
    });
    return h("p");
  }
  expect(() =>
    renderToString(() =>
      boundary(
        () => h(Child, {}),
        () => {
          calls++;
          return "fallback";
        },
      ),
    ),
  ).toThrow(boom);
  expect(calls).toBe(0);
});

test("module-level factories reuse fresh serializer scopes and nested discard ownership", () => {
  const trace: string[] = [];
  function Child() {
    onDestroy(() => trace.push("public"));
    onCleanup(() => trace.push("internal"));
    return h("b", null, "ok");
  }
  const earlier = boundary(() => h(Child, {}), fail);
  expect(
    renderToString(() =>
      boundary(
        () => [earlier, defer(fail)],
        () => {
          expect(trace).toEqual(["internal"]);
          return "fallback";
        },
      ),
    ),
  ).toBe("fallback");
  expect(trace).toEqual(["internal"]);
  for (let i = 0; i < 2; i++)
    expect(renderToString(() => earlier)).toBe("<b>ok</b>");
  expect(trace).toEqual([
    "internal",
    "public",
    "internal",
    "public",
    "internal",
  ]);
});
