import { describe, expect, test } from "bun:test";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  NuxtError,
  callOnce,
  clearError,
  clearNuxtData,
  clearNuxtState,
  createBridgedRef,
  createError,
  defineNuxtPlugin,
  defineNuxtRouteMiddleware,
  definePageMeta,
  isNuxtError,
  isNuxtRef,
  refreshCookie,
  refreshNuxtData,
  showError,
  updateAppConfig,
  useAppConfig,
  useAsyncData,
  useCookie,
  useError,
  useFetch,
  useLazyAsyncData,
  useLazyFetch,
  useNuxtData,
  useRequestEvent,
  useRequestHeaders,
  useRequestURL,
  useRuntimeConfig,
  useState,
  withNuxtRequest,
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

  test("withNuxtRequest, useRequestHeaders, useRequestURL, useCookie, and refreshCookie isolate request state and serialize Set-Cookie headers", () => {
    withNuxtRequest(
      {
        url: "https://example.com/profile?tab=settings",
        headers: {
          "X-Custom-Token": "secret-token",
          Authorization: "Bearer xyz",
          cookie: "theme=dark; count=7; prefs=%7B%22compact%22%3Atrue%7D",
        },
        runtimeConfig: {
          apiSecret: "server-only",
          public: { apiBase: "https://api.example.com" },
        },
        appConfig: {
          title: "Moonshine Nuxt",
          ui: { primary: "indigo" },
        },
      },
      (event) => {
        expect(useRequestEvent()).toBe(event);
        expect(useRequestURL().pathname).toBe("/profile");
        expect(useRequestURL().searchParams.get("tab")).toBe("settings");

        const filteredHeaders = useRequestHeaders(["x-custom-token"]);
        expect(filteredHeaders).toEqual({
          "x-custom-token": "secret-token",
        });
        const allHeaders = useRequestHeaders();
        expect(allHeaders.authorization).toBe("Bearer xyz");

        const theme = useCookie<string>("theme");
        const count = useCookie<number>("count");
        const prefs = useCookie<{ compact: boolean }>("prefs");
        const missingWithDefault = useCookie("locale", { default: () => "en" });
        const roCookie = useCookie("theme", { readonly: true });

        expect(theme.value).toBe("dark");
        expect(count.value).toBe(7);
        expect(prefs.value).toEqual({ compact: true });
        expect(missingWithDefault.value).toBe("en");

        roCookie.value = "ignored";
        theme.value = "light";
        expect(event.responseHeaders.get("Set-Cookie")).toContain(
          "theme=light; Path=/",
        );

        event.headers.set("cookie", "theme=solarized");
        refreshCookie("theme");
        expect(theme.value).toBe("solarized");

        const rt = useRuntimeConfig();
        expect(rt.apiSecret).toBe("server-only");
        expect(rt.public.apiBase).toBe("https://api.example.com");
        expect(rt.app.baseURL).toBe("/");

        const appCfg = useAppConfig<{
          title: string;
          ui: { primary: string; rounded?: boolean };
        }>();
        expect(appCfg.title).toBe("Moonshine Nuxt");
        updateAppConfig({ ui: { rounded: true } });
        expect(appCfg.ui).toEqual({ primary: "indigo", rounded: true });
      },
    );
  });

  test("useFetch and useLazyFetch build URLs, serialize JSON bodies, invoke interceptors, and react to query/url changes", async () => {
    const calls: Array<{ url: string; method?: string; body?: any }> = [];
    const customFetch = async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method,
        body: init.body,
      });
      return { url, ok: true };
    };

    const page = createBridgedRef(1);
    const search = createBridgedRef("moon");
    const hookOrder: string[] = [];

    let stopRoot!: () => void;
    const res = await createRoot(async (dispose) => {
      stopRoot = dispose;
      return await useFetch<{ url: string; ok: boolean }>("/items", {
        baseURL: "https://api.example.com/",
        query: () => ({ page: page.value, q: search.value }),
        method: "POST",
        body: () => ({ active: true }),
        $fetch: customFetch,
        onRequest() {
          hookOrder.push("onRequest");
        },
      });
    });

    expect(res.status.value).toBe("success");
    expect(res.data.value).toEqual({
      url: "https://api.example.com/items?page=1&q=moon",
      ok: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toBe('{"active":true}');
    expect(hookOrder).toEqual(["onRequest"]);

    page.value = 2;
    await new Promise((r) => setTimeout(r, 10));
    expect(res.data.value).toEqual({
      url: "https://api.example.com/items?page=2&q=moon",
      ok: true,
    });
    stopRoot();

    // useLazyFetch with immediate: false
    const lazyRes = useLazyFetch("/lazy", {
      immediate: false,
      $fetch: customFetch,
    });
    expect(lazyRes.status.value).toBe("idle");
    await lazyRes.execute();
    expect(lazyRes.status.value).toBe("success");
    expect(lazyRes.data.value?.url).toBe("/lazy");
  });

  test("createError, showError, useError, clearError, isNuxtError, and callOnce manage scoped error and one-shot state", async () => {
    await withNuxtRequest({ url: "https://example.com/" }, async () => {
      expect(useError().value).toBeUndefined();
      const err = createError({
        statusCode: 404,
        statusMessage: "Not Found",
        data: { resource: "post" },
      });
      expect(err).toBeInstanceOf(NuxtError);
      expect(isNuxtError(err)).toBe(true);
      expect(err.toJSON()).toEqual({
        message: "Not Found",
        statusCode: 404,
        statusMessage: "Not Found",
        data: { resource: "post" },
      });

      showError(err);
      expect(useError().value).toBe(err);

      await clearError();
      expect(useError().value).toBeUndefined();

      let runs = 0;
      const runOnce = async () => {
        await Promise.resolve();
        runs++;
      };
      await Promise.all([
        callOnce("init-metric", runOnce),
        callOnce("init-metric", runOnce),
      ]);
      await callOnce("init-metric", runOnce);
      expect(runs).toBe(1);

      await callOnce("init-metric", runOnce, { mode: "navigation" });
      expect(runs).toBe(2);
    });
  });
});
