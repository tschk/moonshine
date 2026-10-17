import { expect, test } from "bun:test";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import { createMemo } from "@tschk/moonshine-dom/reactive";
import { onDestroy } from "../src/svelte";

test("SSR destruction follows authored component ownership through synthetic memos", () => {
  const trace: string[] = [];
  function Child() {
    onDestroy(() => trace.push("child"));
    const snippet = createMemo(() => {
      onDestroy(() => trace.push("snippet"));
      return "snippet";
    });
    return h("b", null, snippet());
  }
  function Parent() {
    onDestroy(() => trace.push("parent"));
    const row = createMemo(() => {
      onDestroy(() => trace.push("row"));
      return "row";
    });
    return h("section", null, row(), h(Child, {}));
  }
  for (let request = 0; request < 2; request++) {
    trace.length = 0;
    expect(renderToString(() => h(Parent, {}))).toBe(
      "<section>row<b>snippet</b></section>",
    );
    expect(trace).toEqual(["child", "snippet", "parent", "row"]);
  }
});
