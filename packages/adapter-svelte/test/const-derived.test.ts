import { test, expect } from "bun:test";
import "../../react/test/dom";
import {
  createComponent,
  getComponentContext,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import {
  createRoot,
  createSignal,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { withRuneScheduler, getRuneConsumer } from "../src/pre";
import { createConstDerived } from "../src/const-derived";
import { onDestroy, getContext, setContext } from "../src/svelte";

test("lazy evaluation tracks reads, replaces owned cleanup and stops with parent", () => {
  const [read, set] = createSignal(1);
  const trace: string[] = [];
  let value!: { readonly value: number };
  let frame!: ComponentContext;
  const stop = createRoot((dispose) => {
    createComponent(
      () =>
        withRuneScheduler(() => {
          frame = getComponentContext();
          setContext("key", "author");
          value = createConstDerived(() => {
            const n = read();
            trace.push(`setup:${n}:${getContext("key")}`);
            onDestroy(() => trace.push(`destroy:${n}`));
            return n;
          });
        }),
      {},
      "dom",
    );
    return dispose;
  });
  expect(trace).toEqual([]);
  expect(frame.active).toBe(false);
  expect(value.value).toBe(1);
  expect(value.value).toBe(1);
  expect(trace).toEqual(["setup:1:author"]);
  expect(frame.active).toBe(false);
  set(2);
  expect(trace).toEqual(["setup:1:author"]);
  expect(value.value).toBe(2);
  expect(trace).toEqual(["setup:1:author", "destroy:1", "setup:2:author"]);
  stop();
  expect(trace).toEqual([
    "setup:1:author",
    "destroy:1",
    "setup:2:author",
    "destroy:2",
  ]);
});
test("failed evaluation disposes work, restores frame and retries without losing tracking", () => {
  const [read, set] = createSignal(0);
  const trace: number[] = [];
  const failure = { failure: true };
  let value!: { readonly value: number };
  let frame!: ComponentContext;
  const stop = createRoot((dispose) => {
    createComponent(
      () =>
        withRuneScheduler(() => {
          frame = getComponentContext();
          value = createConstDerived(() => {
            const n = read();
            onDestroy(() => trace.push(n));
            if (n === 0) throw failure;
            return n;
          });
        }),
      {},
      "dom",
    );
    return dispose;
  });
  try {
    void value.value;
    throw Error("missing error");
  } catch (e) {
    expect(e).toBe(failure);
  }
  expect(trace).toEqual([0]);
  expect(frame.active).toBe(false);
  set(1);
  expect(value.value).toBe(1);
  stop();
  expect(trace).toEqual([0, 1]);
});
test("cleanup failure prevents fresh setup but parent cleanup drains other peers", () => {
  const [read, set] = createSignal(0);
  const first = { first: true };
  const trace: string[] = [];
  let value!: { readonly value: number };
  const stop = createRoot((dispose) => {
    createComponent(
      () =>
        withRuneScheduler(() => {
          value = createConstDerived(() => {
            const n = read();
            trace.push(`setup:${n}`);
            onDestroy(() => {
              trace.push(`cleanup:${n}`);
              throw first;
            });
            return n;
          });
          onCleanup(() => trace.push("peer"));
        }),
      {},
      "dom",
    );
    return dispose;
  });
  expect(value.value).toBe(0);
  set(1);
  try {
    void value.value;
    throw Error("missing");
  } catch (e) {
    expect(e).toBe(first);
  }
  expect(trace).toEqual(["setup:0", "cleanup:0"]);
  expect(value.value).toBe(1);
  try {
    stop();
  } catch (e) {
    expect(e).toBe(first);
  }
  expect(trace).toEqual([
    "setup:0",
    "cleanup:0",
    "setup:1",
    "cleanup:1",
    "peer",
  ]);
});

test("manual noncomponent scheduling invents no consumer and source groups restore through synthetic frames", () => {
  const stopManual = createRoot((stop) => {
    withRuneScheduler(() => expect(getRuneConsumer()).toBeUndefined());
    return stop;
  });
  stopManual();
  let source: ReturnType<typeof getComponentContext> | undefined;
  const stop = createRoot((dispose) => {
    createComponent(
      () =>
        withRuneScheduler(() => {
          source = getComponentContext();
          expect(getRuneConsumer()).toBe(source);
          createComponent(
            () => {
              expect(getComponentContext()).not.toBe(source);
              expect(getRuneConsumer()).toBe(source);
              createComponent(
                () =>
                  withRuneScheduler(() => {
                    expect(getRuneConsumer()).toBe(getComponentContext());
                    expect(getRuneConsumer()).not.toBe(source);
                  }),
                {},
                "dom",
              );
              expect(getRuneConsumer()).toBe(source);
            },
            {},
            "dom",
          );
          expect(getRuneConsumer()).toBe(source);
        }),
      {},
      "dom",
    );
    return dispose;
  });
  stop();
  expect(source?.owner.disposed).toBe(true);
});
