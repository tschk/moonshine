import { expect, test } from "bun:test";
import {
  afterRender,
  defer,
  h,
  renderToString,
  settle,
  onCleanup,
} from "@tschk/moonshine-dom/ssr";
import { onDestroy } from "../src/svelte";

test("Svelte SSR destroys only the accepted attempt while internal cleanup drains discarded work", () => {
  const trace: string[] = [];
  let internal = 0,
    pass = 0;
  function Child() {
    const current = ++pass;
    onDestroy(() => trace.push(`child:${current}`));
    onCleanup(() => internal++);
    return h("b", null, current);
  }
  function Parent() {
    onDestroy(() => trace.push("parent"));
    return settle((invalidate) =>
      afterRender(
        defer(() => h(Child, {})),
        () => {
          if (pass === 1) invalidate();
        },
      ),
    );
  }
  expect(renderToString(() => h(Parent, {}))).toBe("<b>2</b>");
  expect(trace).toEqual(["child:2", "parent"]);
  expect(internal).toBe(2);
});

test("failed trial skips its destroy hooks while preserving stable parent cleanup and render failure", () => {
  const trace: string[] = [];
  const failure = Error("child failed");
  function Child() {
    onDestroy(() => trace.push("child"));
    onCleanup(() => trace.push("internal"));
    throw failure;
  }
  function Parent() {
    onDestroy(() => trace.push("parent"));
    return settle(() => h(Child, {}));
  }
  expect(() => renderToString(() => h(Parent, {}))).toThrow(failure);
  expect(trace).toEqual(["internal", "parent"]);
});
