import { describe, expect, test } from "bun:test";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  clearNuxtData,
  clearNuxtState,
  createBridgedRef,
  defineNuxtPlugin,
  defineNuxtRouteMiddleware,
  definePageMeta,
  isNuxtRef,
  refreshNuxtData,
  useAsyncData,
  useLazyAsyncData,
  useNuxtData,
  useState,
} from "../src/composables";

describe("@tschk/moonshine-nuxt composables", () => {
  test("useState shares reactive refs by key within a scope and isolates across roots and SSR requests", () => {
    createRoot((disposeA) => {
      const a1 = useState("counter", () => 10);
      const a2 = useState<number>("counter");
      const auto = useState(() => "auto-val");
      expect(isNuxtRef(a1)).toBe(true);
      expect(a1).toBe(a2);
      expect(a1.value).toBe(10);
      expect(auto.value).toBe("auto-val");

      a1.value = 15;
      expect(a2.value).toBe(15);

      createRoot((disposeB) => {
        const b1 = useState("counter", () => 100);
        expect(b1.value).toBe(100);
        expect(a1.value).toBe(15);
        disposeB();
      });

      clearNuxtState("counter");
      expect(a1.value).toBeUndefined();
      const recreated = useState("counter", () => 42);
      expect(recreated.value).toBe(42);
      disposeA();
    });

    const ssrValues: number[] = [];
    withSSRRendering(() => {
      const state = useState("req", () => 1);
      state.value = 2;
      ssrValues.push(useState<number>("req").value);
    });
    withSSRRendering(() => {
      const state = useState("req", () => 1);
      ssrValues.push(state.value);
    });
    expect(ssrValues).toEqual([2, 1]);
  });

  test("useAsyncData, useLazyAsyncData, useNuxtData, refreshNuxtData, and clearNuxtData manage async state", async () => {
    let stop!: () => void;
    let calls = 0;
    const filter = createBridgedRef("all");
    let pendingResult!: ReturnType<
      typeof useAsyncData<
        { items: string[]; total: number; secret: string },
        { items: string[]; total: number }
      >
    >;
    let cachedDuringSetup!: ReturnType<
      typeof useNuxtData<{ items: string[]; total: number }>
    >;

    createRoot((dispose) => {
      stop = dispose;
      pendingResult = useAsyncData(
        "users",
        async () => {
          calls++;
          return {
            items: [`user-${filter.value}-${calls}`],
            total: calls,
            secret: "omit",
          };
        },
        {
          default: () => ({ items: ["default"], total: 0 }),
          transform: (res) => ({
            items: res.items,
            total: res.total,
            secret: res.secret,
          }),
          pick: ["items", "total"],
          watch: [filter],
        },
      );
      cachedDuringSetup = useNuxtData<{ items: string[]; total: number }>(
        "users",
      );
    });

    const result = await pendingResult;
    expect(result.status.value).toBe("success");
    expect(result.pending.value).toBe(false);
    expect(result.error.value).toBeNull();
    expect(result.data.value).toEqual({
      items: ["user-all-1"],
      total: 1,
    } as any);

    expect(cachedDuringSetup.data).toBe(result.data);
    expect(cachedDuringSetup.data.value).toEqual({
      items: ["user-all-1"],
      total: 1,
    });

    // Reactive watch triggers refresh when filter changes
    filter.value = "active";
    await Promise.resolve();
    await Promise.resolve();
    expect(result.data.value).toEqual({
      items: ["user-active-2"],
      total: 2,
    } as any);

    await result.refresh();
    expect(result.data.value).toEqual({
      items: ["user-active-3"],
      total: 3,
    } as any);

    result.clear();
    expect(result.status.value).toBe("idle");
    expect(result.data.value).toEqual({ items: ["default"], total: 0 });
    stop();

    const topLevel = await useAsyncData("top-users", async () => "ok");
    expect(useNuxtData<string>("top-users").data.value).toBe("ok");
    await refreshNuxtData("top-users");
    clearNuxtData("top-users");
    expect(topLevel.status.value).toBe("idle");

    const lazy = useLazyAsyncData("lazy-item", async () => "loaded", {
      immediate: false,
    });
    expect(lazy.status.value).toBe("idle");
    expect(lazy.data.value).toBeNull();
    await lazy.execute();
    expect(lazy.status.value).toBe("success");
    expect(lazy.data.value).toBe("loaded");
    clearNuxtData("lazy-item");
  });

  test("definePageMeta, defineNuxtPlugin, and defineNuxtRouteMiddleware return their definitions intact", () => {
    const meta = definePageMeta({ layout: "admin", middleware: ["auth"] });
    const plugin = defineNuxtPlugin(() => ({ provide: { hello: "world" } }));
    const mw = defineNuxtRouteMiddleware((to) => to);

    expect(meta).toEqual({ layout: "admin", middleware: ["auth"] });
    expect(typeof plugin).toBe("function");
    expect(typeof mw).toBe("function");
  });
});
