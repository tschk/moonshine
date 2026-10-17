import { expect, test } from "bun:test";
import { h, render } from "@tschk/moonshine-dom/dom";
import { ErrorBoundary, mapArray } from "@tschk/moonshine-dom/control";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { getRenderScheduler } from "@tschk/moonshine-dom/reactive";
import { createState, createRuneEffect } from "../src/runes";
import { onDestroy, tick } from "../src/svelte";
import { withRuneScheduler } from "../src/pre";
import { createRawSnippet, type RawSnippet } from "../src/raw-snippet";
import { createRawSnippetSlot, invokeSnippetDOM } from "../src/raw-snippet-dom";
import "../../react/test/dom";

test.each(["factory", "setup", "cleanup", "both"] as const)(
  "raw %s failure drains owned resources, resets, and leaves no active work",
  async (phase) => {
    const value = createState(0);
    const selected = createState<RawSnippet | undefined>(undefined);
    const effects: number[][] = [],
      destroyed: number[] = [],
      returned: number[] = [],
      successful: number[] = [];
    const effectCleanup: number[] = [];
    let serial = 0,
      cleanupFailure = false,
      reset = () => {};
    function make(name: string) {
      return createRawSnippet(() => {
        const instance = ++serial;
        if (name === "factory") throw Error("factory-primary");
        return {
          render: () => "<b>" + name + "</b>",
          setup(element: Element) {
            createRuneEffect(() => {
              effects.push([instance, value.value]);
              return () => effectCleanup.push(instance);
            });
            onDestroy(() => destroyed.push(instance));
            if (name === "setup") throw Error("setup-primary");
            successful.push(instance);
            return () => {
              expect(element.isConnected).toBe(false);
              returned.push(instance);
              if (cleanupFailure) {
                cleanupFailure = false;
                throw Error("cleanup-primary");
              }
            };
          },
        };
      });
    }
    const initial = make("A");
    selected.value = initial;
    function Consumer() {
      return withRuneScheduler(() => {
        const consumer = peekComponentContext()!,
          scheduler = getRenderScheduler(),
          slot = createRawSnippetSlot();
        const mapped = mapArray(
          () => [selected.value!],
          (snippet) => {
            const initializing = consumer.active;
            return h(
              () =>
                slot.render(() =>
                  invokeSnippetDOM(
                    snippet,
                    [],
                    consumer,
                    initializing,
                    scheduler,
                  ),
                ),
              {},
            );
          },
          slot.deferRemoved,
        );
        return h("section", {}, () => slot.commit(mapped()));
      });
    }
    const target = document.createElement("main");
    document.body.append(target);
    const stop = render(
      () =>
        h(
          () =>
            withRuneScheduler(() =>
              ErrorBoundary({
                children: () => h(Consumer, {}),
                fallback(error, retry) {
                  reset = retry;
                  return h("p", { "data-fallback": "" }, error.message);
                },
              }),
            ),
          {},
        ),
      target,
    );
    try {
      await tick();
      expect(target.querySelector("b")?.textContent).toBe("A");
      cleanupFailure = phase === "cleanup" || phase === "both";
      selected.value = make(
        phase === "both" ? "setup" : phase === "cleanup" ? "B" : phase,
      );
      await tick();
      // Preserve the original setup error and drain peers even when old teardown throws.
      // Official Svelte aborts cleanup in the combined case; native intentionally finishes it.
      expect(target.querySelector("[data-fallback]")?.textContent).toBe(
        (phase === "both" ? "setup" : phase) + "-primary",
      );
      expect(target.querySelector("b")).toBeNull();
      const failedEffects = effects.slice();
      value.value = 1;
      await tick();
      expect(effects).toEqual(failedEffects);
      expect(destroyed).toContain(1);
      expect(returned).toContain(1);
      selected.value = initial;
      reset();
      await tick();
      expect(target.querySelector("b")?.textContent).toBe("A");
      expect(target.querySelector("[data-fallback]")).toBeNull();
      expect(effects.at(-1)).toEqual([3, 1]);
      stop();
      stop();
      expect(target.childNodes.length).toBe(0);
      expect(returned.toSorted()).toEqual(successful.toSorted());
      expect(new Set(returned).size).toBe(returned.length);
      expect(new Set(destroyed).size).toBe(destroyed.length);
      expect(destroyed.length).toBe(phase === "factory" ? 2 : 3);
      expect(effectCleanup.toSorted()).toEqual(
        effects.map(([instance]) => instance).toSorted(),
      );
      const completed = {
        effects: effects.slice(),
        destroyed: destroyed.slice(),
        returned: returned.slice(),
      };
      value.value = 2;
      await tick();
      expect({ effects, destroyed, returned }).toEqual(completed);
    } finally {
      stop();
      target.remove();
    }
  },
);
