import { describe, expect, test } from "bun:test";
import "../../react/test/dom";
import { createComponent } from "@tschk/moonshine-dom/component";
import { h as hDOM } from "@tschk/moonshine-dom/dom";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import {
  defineAsyncComponent,
  defineComponent,
  KeepAlive,
  mergeProps,
  nextTick,
  onActivated,
  onBeforeUpdate,
  onDeactivated,
  onServerPrefetch,
  onUpdated,
  ref,
  Suspense,
  Teleport,
  Transition,
  TransitionGroup,
  useAttrs,
  useSlots,
  version,
  watchEffect,
  watchPostEffect,
} from "../src/reactive";
import { withDefaultSlot } from "../src/slots";

describe("@tschk/moonshine-vue watchEffect, watchPostEffect, nextTick, mergeProps, useAttrs, useSlots, defineComponent, defineAsyncComponent", () => {
  test("watchEffect (sync/pre) and watchPostEffect + nextTick", async () => {
    const count = ref(1);
    const syncLog: Array<number | string> = [];
    const postLog: Array<number | string> = [];

    let stopRoot!: () => void;
    createRoot((dispose) => {
      stopRoot = dispose;
      const syncHandle = watchEffect((onInvalidate) => {
        const val = count.value;
        syncLog.push(val);
        onInvalidate(() => syncLog.push(`clean:${val}`));
      });

      const postHandle = watchPostEffect((onInvalidate) => {
        const val = count.value;
        postLog.push(val);
        onInvalidate(() => postLog.push(`post-clean:${val}`));
      });

      expect(syncLog).toEqual([1]);
      expect(postLog).toEqual([]);

      syncHandle.pause();
      count.value = 2;
      expect(syncLog).toEqual([1]);
      syncHandle.resume();
      expect(syncLog).toEqual([1, "clean:1", 2]);

      postHandle.pause();
      postHandle.resume();
    });

    await nextTick();
    expect(postLog).toEqual([2]);

    count.value = 3;
    expect(syncLog).toEqual([1, "clean:1", 2, "clean:2", 3]);
    expect(postLog).toEqual([2]);

    const tickedValue = await nextTick(() => count.value * 10);
    expect(tickedValue).toBe(30);
    expect(postLog).toEqual([2, "post-clean:2", 3]);

    stopRoot();
    expect(syncLog).toContain("clean:3");
    expect(postLog).toContain("post-clean:3");
  });

  test("mergeProps combines class, style, event listeners, and scalar attributes", () => {
    const calls: string[] = [];
    const fn1 = () => calls.push("first");
    const fn2 = () => calls.push("second");

    const merged = mergeProps(
      {
        class: "btn",
        style: "color: red; font-size: 12px",
        onClick: fn1,
        id: "old",
      },
      {
        class: ["btn-primary", { active: true, disabled: false }],
        style: { color: "blue", fontWeight: "bold" },
        onClick: fn2,
        id: "new",
      },
    );

    expect(merged.class).toBe("btn btn-primary active");
    expect(merged.style).toEqual({
      color: "blue",
      "font-size": "12px",
      fontWeight: "bold",
    });
    expect(merged.id).toBe("new");
    expect(Array.isArray(merged.onClick)).toBe(true);
    for (const handler of merged.onClick) {
      handler();
    }
    expect(calls).toEqual(["first", "second"]);
  });

  test("useAttrs, useSlots, and additional lifecycle hooks in component scopes", async () => {
    let prefetchRan = false;
    let capturedAttrs: Record<string, unknown> = {};
    let hasDefaultSlot = false;
    let hasHeaderSlot = false;

    const BaseCard = defineComponent((_props: Record<string, any>) => {
      const attrs = useAttrs();
      const slots = useSlots();
      capturedAttrs = { ...attrs };
      hasDefaultSlot = typeof slots.default === "function";
      hasHeaderSlot = typeof slots.header === "function";

      onBeforeUpdate(() => {});
      onUpdated(() => {});
      onActivated(() => {});
      onDeactivated(() => {});
      onServerPrefetch(async () => {
        prefetchRan = true;
      });

      return h(
        "section",
        { "data-role": String(attrs.role ?? "") },
        slots.header ? (slots.header() as any) : null,
        slots.default ? (slots.default() as any) : null,
      );
    });

    const WrappedCard = withDefaultSlot(BaseCard, () =>
      h("p", null, "Body slot"),
    );
    const html = renderToString(() =>
      h(WrappedCard, {
        role: "region",
        title: "Card Title",
        $slots: {
          header: () => h("h2", null, "Header slot"),
        },
      }),
    );

    expect(html).toBe(
      '<section data-role="region"><h2>Header slot</h2><p>Body slot</p></section>',
    );
    expect(capturedAttrs).toEqual({
      role: "region",
      title: "Card Title",
    });
    expect(hasDefaultSlot).toBe(true);
    expect(hasHeaderSlot).toBe(true);
    await Promise.resolve();
    expect(prefetchRan).toBe(true);
    expect(version).toBe("3.5.13");
  });

  test("defineAsyncComponent resolves async module and supports loading/error/retry", async () => {
    let attempts = 0;
    const AsyncWidget = defineAsyncComponent({
      delay: 0,
      loadingComponent: () => "Loading...",
      errorComponent: ({ error }: { error: Error }) => `Error:${error.message}`,
      loader: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("transient");
        }
        return {
          default: (props: { label: string }) => `Loaded:${props.label}`,
        };
      },
      onError(_err, retry, fail, count) {
        if (count < 2) {
          retry();
        } else {
          fail();
        }
      },
    });

    let view!: () => unknown;
    let stop!: () => void;
    createRoot((dispose) => {
      stop = dispose;
      view = createComponent(
        (p: { label: string }) => AsyncWidget(p),
        { label: "OK" },
        "dom",
      ) as () => unknown;
      expect(view()).toBe("Loading...");
    });

    await new Promise((r) => setTimeout(r, 15));
    expect(view()).toBe("Loaded:OK");
    expect(attempts).toBe(2);
    stop();
  });

  test("Teleport, KeepAlive, Transition, TransitionGroup, and Suspense render in SSR and DOM", () => {
    const ssrHtml = renderToString(() =>
      h("div", null, [
        h(Transition, { name: "fade" }, () =>
          h(TransitionGroup, { name: "list", tag: "ul" }, () =>
            h("li", null, "Item 1"),
          ),
        ),
        h(Suspense, {}, () =>
          h(Teleport, { to: "#modal", disabled: true }, () =>
            h("span", null, "Modal Body"),
          ),
        ),
      ]),
    );
    expect(ssrHtml).toBe(
      "<div><ul><li>Item 1</li></ul><span>Modal Body</span></div>",
    );

    const portalHost = document.createElement("div");
    portalHost.id = "portal-target";
    document.body.appendChild(portalHost);

    try {
      let disposePortal!: () => void;
      const inlineNode = createRoot((dispose) => {
        disposePortal = dispose;
        return hDOM("div", { class: "host" }, [
          hDOM(Teleport, {
            to: portalHost,
            disabled: false,
            children: () => hDOM("p", { class: "teleported" }, "In Portal"),
          }),
        ]);
      }) as HTMLElement;

      expect(inlineNode.textContent).toBe("");
      expect(portalHost.querySelector(".teleported")?.textContent).toBe(
        "In Portal",
      );
      disposePortal();
      expect(portalHost.querySelector(".teleported")).toBeNull();
    } finally {
      portalHost.remove();
    }

    const activeView = ref<"a" | "b">("a");
    let countA = 0;
    let countB = 0;
    const ViewA = () => {
      countA++;
      return hDOM("span", null, `A:${countA}`);
    };
    const ViewB = () => {
      countB++;
      return hDOM("span", null, `B:${countB}`);
    };

    let disposeKeepAlive!: () => void;
    const kaContainer = createRoot((dispose) => {
      disposeKeepAlive = dispose;
      return hDOM("div", null, [
        hDOM(KeepAlive, {
          max: 2,
          children: () => (activeView.value === "a" ? ViewA : ViewB),
        }),
      ]);
    }) as HTMLElement;

    expect(kaContainer.textContent).toBe("A:1");
    activeView.value = "b";
    expect(kaContainer.textContent).toBe("B:1");
    activeView.value = "a";
    expect(kaContainer.textContent).toBe("A:1");
    expect(countA).toBe(1);
    expect(countB).toBe(1);
    disposeKeepAlive();
  });
});
