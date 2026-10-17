import { expect, test } from "bun:test";
import { createRoot, install } from "../src/cleanup-policy";
import {
  cleanupOrderKey,
  getOwner,
  onCleanup,
  requestCleanupFinalizerFlush,
} from "@tschk/moonshine-dom/reactive";
import { renderToString, h } from "@tschk/moonshine-dom/ssr";
import { createComponent } from "@tschk/moonshine-dom/component";
test("two nested SSR requests stay FIFO with independent context and client policy restored", () => {
  const trace: string[] = [];
  createRoot((stop) => {
    const parent = getOwner()!,
      context = parent.context;
    context!.set(Symbol.for("data"), 42);
    onCleanup(() => trace.push("client:first"));
    for (let i = 0; i < 2; i++) {
      const html = renderToString(() => {
        expect(getOwner()!.context?.has(cleanupOrderKey)).toBe(false);
        expect(getOwner()!.context?.get(Symbol.for("data"))).toBe(42);
        onCleanup(() => trace.push("request" + i + ":first"));
        const nested = renderToString(() => {
          onCleanup(() => trace.push("nested" + i + ":first"));
          onCleanup(() => trace.push("nested" + i + ":last"));
          return h("i", null, "<&");
        });
        onCleanup(() => trace.push("request" + i + ":last"));
        return h("p", null, nested);
      });
      expect(html).toBe("<p>&lt;i&gt;&amp;lt;&amp;amp;&lt;/i&gt;</p>");
      expect(getOwner()).toBe(parent);
      expect(parent.context).toBe(context);
      expect(parent.context!.has(cleanupOrderKey)).toBe(true);
    }
    onCleanup(() => trace.push("client:last"));
    stop();
  });
  expect(trace).toEqual([
    "nested0:first",
    "nested0:last",
    "request0:first",
    "request0:last",
    "nested1:first",
    "nested1:last",
    "request1:first",
    "request1:last",
    "client:last",
    "client:first",
  ]);
});
test("SSR throw preserves original error drains FIFO and restores parent policy", () => {
  const original = Error("render"),
    later = Error("cleanup"),
    trace: string[] = [];
  createRoot((stop) => {
    const parent = getOwner()!,
      context = parent.context;
    expect(() =>
      renderToString(() => {
        onCleanup(() => {
          trace.push("first");
          throw later;
        });
        onCleanup(() => trace.push("peer"));
        throw original;
      }),
    ).toThrow(original);
    expect(parent.context).toBe(context);
    onCleanup(() => trace.push("client:first"));
    onCleanup(() => trace.push("client:last"));
    stop();
  });
  expect(trace).toEqual(["first", "peer", "client:last", "client:first"]);
});
test("server installer bypasses reverse for marker and explicit SSR frame without allocating absent context", () => {
  const trace: string[] = [];
  renderToString(() => {
    const context = getOwner()!.context;
    install();
    expect(getOwner()!.context).toBe(context);
    const dispose = createRoot((stop) => {
      onCleanup(() => trace.push("first"));
      onCleanup(() => trace.push("last"));
      return stop;
    });
    dispose();
    return null;
  });
  createRoot((stop) => {
    createComponent(
      () => {
        const owner = getOwner()!,
          context = owner.context;
        install();
        expect(owner.context).toBe(context);
        expect(owner.context?.has(cleanupOrderKey)).toBe(false);
        return null;
      },
      {},
      "ssr",
    );
    stop();
  });
  expect(trace).toEqual(["first", "last"]);
});
test("fresh finalizer notification during final flush is drained before disposal returns", () => {
  const trace: number[] = [];
  function notify(n: number) {
    trace.push(n);
    if (n < 8) requestCleanupFinalizerFlush(() => notify(n + 1));
  }
  const stop = createRoot((dispose) => {
    onCleanup(() => requestCleanupFinalizerFlush(() => notify(0)));
    return dispose;
  });
  stop();
  expect(trace).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
});
test("throwing flush still drains newly requested final notification and preserves original", () => {
  const original = Error("flush"),
    trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() =>
      requestCleanupFinalizerFlush(() => {
        trace.push("first");
        requestCleanupFinalizerFlush(() => trace.push("peer"));
        throw original;
      }),
    );
    return dispose;
  });
  expect(stop).toThrow(original);
  expect(trace).toEqual(["first", "peer"]);
});
test("request root without client policy reuses inherited context without allocation", async () => {
  const { createRoot: nativeRoot } =
    await import("@tschk/moonshine-dom/reactive");
  nativeRoot((stop) => {
    const parent = getOwner()!;
    const context = new Map<symbol, unknown>([[Symbol.for("data"), 7]]);
    parent.context = context;
    expect(
      renderToString(() => {
        expect(getOwner()!.context).toBe(context);
        return h("p", null, "same");
      }),
    ).toBe("<p>same</p>");
    expect(parent.context).toBe(context);
    stop();
  });
});
