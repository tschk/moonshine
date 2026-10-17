import { createRawSnippet } from "../src/raw-snippet";
import { test } from "bun:test";
import assert from "node:assert/strict";
import { h, renderToString, settle } from "@tschk/moonshine-dom/ssr";
import {
  peekComponentContext,
  setContext,
} from "@tschk/moonshine-dom/component";
import { onDestroy } from "@tschk/moonshine-svelte/svelte";
import { invokeRawSSR as bridgeSSR } from "../src/raw-snippet-ssr";
test("ssr-no-outer", () => {
  const records = [];
  for (const phase of ["factory", "render"]) {
    const trace: string[] = [];
    function Consumer() {
      setContext("provider", "consumer");
      const frame = peekComponentContext()!;
      onDestroy(() => trace.push("consumer-destroy"));
      return settle(() =>
        invokeRawSSR<[]>(
          () => {
            trace.push("factory");
            onDestroy(() => trace.push("raw-destroy"));
            if (phase === "factory") throw Error("primary factory");
            return {
              render() {
                throw Error("primary render");
              },
              get setup(): never {
                throw Error("setup read");
              },
            };
          },
          [],
          frame,
        ),
      );
    }
    assert.throws(
      () => renderToString(() => h(Consumer, {})),
      new RegExp("primary " + phase),
    );
    assert.deepEqual(trace, ["factory", "consumer-destroy", "raw-destroy"]);
    records.push({ phase, trace });
  }
});

function invokeRawSSR<P extends unknown[]>(
  factory: any,
  values: P,
  consumer: any,
) {
  return bridgeSSR(createRawSnippet<P>(factory), values, consumer);
}
