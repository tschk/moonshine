import { expect, test } from "bun:test";
import {
  createRoot as nativeRoot,
  createComputed,
  onCleanup,
  getOwner,
} from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import { createRoot } from "../src/cleanup-policy";
test("default retains child-forward and callback-FIFO while opted computed scopes inherit reverse", () => {
  const traces: string[][] = [];
  for (const root of [nativeRoot, createRoot]) {
    const trace: string[] = [];
    const stop = root((dispose) => {
      createComputed(() => {
        onCleanup(() => trace.push("a:first"));
        onCleanup(() => trace.push("a:last"));
      });
      createComputed(() => onCleanup(() => trace.push("b")));
      onCleanup(() => trace.push("parent:first"));
      onCleanup(() => trace.push("parent:last"));
      return dispose;
    });
    stop();
    traces.push(trace);
  }
  expect(traces).toEqual([
    ["a:first", "a:last", "b", "parent:first", "parent:last"],
    ["b", "a:last", "a:first", "parent:last", "parent:first"],
  ]);
});
test("native component frame resets inherited policy without changing Solid parent policy", () => {
  const trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() => trace.push("solid:first"));
    createComponent(
      () => {
        createComputed(() => onCleanup(() => trace.push("native:a")));
        createComputed(() => onCleanup(() => trace.push("native:b")));
        onCleanup(() => trace.push("native:first"));
        onCleanup(() => trace.push("native:last"));
      },
      {},
      "dom",
    );
    onCleanup(() => trace.push("solid:last"));
    return dispose;
  });
  stop();
  expect(trace).toEqual([
    "native:a",
    "native:b",
    "native:first",
    "native:last",
    "solid:last",
    "solid:first",
  ]);
});
test("reverse order drains every error peer and preserves first executed error", () => {
  const a = Error("a"),
    b = Error("b"),
    trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() => {
      trace.push("first");
      throw a;
    });
    onCleanup(() => {
      trace.push("last");
      throw b;
    });
    return dispose;
  });
  expect(stop).toThrow(b);
  expect(trace).toEqual(["last", "first"]);
  expect(() => stop()).not.toThrow();
});
test("inherited policy requires no per-child context allocation", () => {
  createRoot((stop) => {
    const context = getOwner()!.context;
    createComputed(() => expect(getOwner()!.context).toBe(context));
    stop();
  });
});
test("actual Svelte and Vue component hooks use their default policy inside opted Solid parent", async () => {
  const { onDestroy } = await import("../../adapter-svelte/src/svelte");
  const { onBeforeUnmount, onUnmounted } =
    await import("../../adapter-vue/src/lifecycle");
  const trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() => trace.push("solid:first"));
    createComponent(
      () => {
        onDestroy(() => trace.push("svelte:first"));
        onDestroy(() => trace.push("svelte:last"));
        return null;
      },
      {},
      "dom",
    );
    createComponent(
      () => {
        onBeforeUnmount(() => trace.push("vue:before:first"));
        onBeforeUnmount(() => trace.push("vue:before:last"));
        onUnmounted(() => trace.push("vue:after:first"));
        onUnmounted(() => trace.push("vue:after:last"));
        return null;
      },
      {},
      "dom",
    );
    onCleanup(() => trace.push("solid:last"));
    return dispose;
  });
  stop();
  expect(trace).toEqual([
    "vue:before:first",
    "vue:before:last",
    "svelte:first",
    "svelte:last",
    "solid:last",
    "solid:first",
    "vue:after:first",
    "vue:after:last",
  ]);
});
test("conflicting flush identity rejects instead of overwriting pending implementation", async () => {
  const { requestCleanupFinalizerFlush } =
    await import("@tschk/moonshine-dom/reactive");
  const { queueCleanupFinalizer } = await import("../src/cleanup-finalization");
  const trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() => {
      queueCleanupFinalizer(() => trace.push("peer"));
      requestCleanupFinalizerFlush(() => {});
    });
    return dispose;
  });
  expect(stop).toThrow("Conflicting native cleanup finalizer implementations");
  expect(trace).toEqual(["peer"]);
});
