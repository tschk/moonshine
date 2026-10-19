import { describe, expect, test } from "bun:test";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  NuxtError,
  abortNavigation,
  callOnce,
  clearError,
  clearNuxtData,
  clearNuxtState,
  createBridgedRef,
  createError,
  defineNuxtComponent,
  defineNuxtPlugin,
  defineNuxtRouteMiddleware,
  definePageMeta,
  isNuxtError,
  isNuxtRef,
  navigateTo,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  onNuxtReady,
  onPrehydrate,
  prefetchComponents,
  preloadComponents,
  preloadRouteComponents,
  refreshCookie,
  refreshNuxtData,
  reloadNuxtApp,
  resolveHeadTags,
  setPageLayout,
  setResponseStatus,
  showError,
  tryUseNuxtApp,
  updateAppConfig,
  useAppConfig,
  useAsyncData,
  useCookie,
  useError,
  useFetch,
  useHead,
  useHeadSafe,
  useLazyAsyncData,
  useLazyFetch,
  useLoadingIndicator,
  useNuxtApp,
  useNuxtData,
  useRequestEvent,
  useRequestFetch,
  useRequestHeaders,
  useRequestURL,
  useRoute,
  useRouteAnnouncer,
  useRouter,
  useRuntimeConfig,
  useSeoMeta,
  useServerSeoMeta,
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

  test("useRoute, useRouter, navigateTo, abortNavigation, route guards, setPageLayout, and setResponseStatus", async () => {
    await withNuxtRequest(
      {
        url: "https://example.com/posts/42?tag=news&tag=featured#comments",
        context: { params: { id: "42" }, routeMeta: { auth: true } },
      },
      async (event) => {
        const route = useRoute();
        expect(route.path).toBe("/posts/42");
        expect(route.fullPath).toBe("/posts/42?tag=news&tag=featured#comments");
        expect(route.query).toEqual({ tag: ["news", "featured"] });
        expect(route.hash).toBe("#comments");
        expect(route.params).toEqual({ id: "42" });
        expect(route.meta).toEqual({ auth: true });

        setResponseStatus(201, "Created");
        expect(event.responseStatus).toBe(201);
        expect(event.responseStatusText).toBe("Created");

        setResponseStatus(event, 202, "Accepted");
        expect(event.responseStatus).toBe(202);
        expect(event.responseStatusText).toBe("Accepted");

        setPageLayout("admin");
        expect(useState("_layout").value).toBe("admin");
        expect(route.meta.layout).toBe("admin");

        const redirectRes = await navigateTo(
          { path: "/login", query: { next: "/posts/42" } },
          { redirectCode: 307 },
        );
        expect(redirectRes).toBeInstanceOf(Response);
        expect(event.responseStatus).toBe(307);
        expect(event.responseHeaders.get("Location")).toBe(
          "/login?next=%2Fposts%2F42",
        );
        expect(route.path).toBe("/login");

        await expect(
          navigateTo("https://external.example.com"),
        ).rejects.toThrow(/external/);
        const extRes = await navigateTo("https://external.example.com", {
          external: true,
          redirectCode: 301,
        });
        expect(extRes).toBeInstanceOf(Response);
        expect(event.responseStatus).toBe(301);
        expect(event.responseHeaders.get("Location")).toBe(
          "https://external.example.com",
        );
      },
    );

    // Client-style router with guards and dynamic routes
    globalThis.window?.history?.replaceState?.({}, "", "/");
    await createRoot(async (dispose) => {
      try {
        const router = useRouter();
        const route = useRoute();
        router.addRoute({
          name: "user-detail",
          path: "/users/:username",
          meta: { section: "users" },
        });
        expect(router.hasRoute("user-detail")).toBe(true);
        expect(router.getRoutes()).toHaveLength(1);

        const resolved = router.resolve({
          name: "user-detail",
          params: { username: "ada" },
          query: { tab: "repos" },
          hash: "bio",
        });
        expect(resolved.fullPath).toBe("/users/ada?tab=repos#bio");

        const log: string[] = [];
        onBeforeRouteLeave((to, from) => {
          log.push(`leave:${from.path}->${to.path}`);
        });
        onBeforeRouteUpdate((to) => {
          log.push(`update:${to.fullPath}`);
        });
        const removeBefore = router.beforeEach((to) => {
          if (to.path === "/blocked") {
            return abortNavigation();
          }
          if (to.path === "/old") {
            return "/users/grace";
          }
        });
        router.afterEach((to, _from, failure) => {
          log.push(failure ? `failed:${to.path}` : `after:${to.fullPath}`);
        });

        await router.push("/users/ada");
        expect(route.params).toEqual({ username: "ada" });
        expect(route.meta.section).toBe("users");

        await router.push("/users/ada?tab=stars");
        expect(route.query).toEqual({ tab: "stars" });

        const blocked = await router.push("/blocked");
        expect((blocked as any)?.type).toBe("aborted");
        expect(route.path).toBe("/users/ada");

        await router.push("/old");
        expect(route.path).toBe("/users/grace");
        expect(route.redirectedFrom?.path).toBe("/old");

        removeBefore();
        expect(log).toEqual([
          "leave:/->/users/ada",
          "after:/users/ada",
          "update:/users/ada?tab=stars",
          "after:/users/ada?tab=stars",
          "leave:/users/ada->/blocked",
          "failed:/blocked",
          "leave:/users/ada->/old",
          "leave:/users/ada->/users/grace",
          "after:/users/grace",
        ]);
      } finally {
        globalThis.window?.history?.replaceState?.({}, "", "/");
        dispose();
      }
    });
  });

  test("useHead, useHeadSafe, resolveHeadTags, useSeoMeta, useServerSeoMeta, and component preload helpers", async () => {
    await withNuxtRequest({ url: "https://example.com/" }, async () => {
      const pageTitle = createBridgedRef("Home");
      useHead({
        titleTemplate: "%s | Moonshine",
        htmlAttrs: { lang: "en" },
        meta: [{ name: "description", content: "Initial description" }],
      });

      const seoEntry = useSeoMeta({
        title: () => pageTitle.value,
        description: "Updated SEO description",
        ogTitle: () => `OG: ${pageTitle.value}`,
        ogImage: "https://example.com/og.png",
        twitterCard: "summary_large_image",
        canonical: "https://example.com/home",
      });

      const safeEntry = useHeadSafe({
        script: [{ src: "https://evil.example.com/xss.js" }],
        link: [
          { rel: "stylesheet", href: "https://evil.example.com/bad.css" },
          {
            rel: "icon",
            href: "https://example.com/favicon.ico",
            onload: "alert(1)",
            "data-theme": "dark",
          },
          { rel: "canonical", href: "javascript:alert(1)" },
        ],
        meta: [
          {
            "http-equiv": "refresh",
            content: "0;url=https://evil.example.com",
          },
          { name: "author", content: "Ada", onclick: "evil()" },
        ],
        bodyAttrs: {
          class: "theme-dark",
          onload: "evil()",
        },
      });

      let resolved = resolveHeadTags();
      expect(resolved.title).toBe("Home | Moonshine");
      expect(resolved.htmlAttrs).toEqual({ lang: "en" });
      expect(resolved.bodyAttrs).toEqual({ class: "theme-dark" });
      expect(resolved.script).toEqual([]);
      expect(resolved.link).toEqual([
        { rel: "canonical", href: "https://example.com/home" },
        {
          rel: "icon",
          href: "https://example.com/favicon.ico",
          "data-theme": "dark",
        },
      ]);
      expect(resolved.meta).toEqual([
        { name: "description", content: "Updated SEO description" },
        { property: "og:title", content: "OG: Home" },
        { property: "og:image", content: "https://example.com/og.png" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "author", content: "Ada" },
      ]);

      pageTitle.value = "Docs";
      resolved = resolveHeadTags();
      expect(resolved.title).toBe("Docs | Moonshine");
      expect(
        resolved.meta.find((m) => m.property === "og:title")?.content,
      ).toBe("OG: Docs");

      useServerSeoMeta({ robots: "index, follow" });
      expect(
        resolveHeadTags().meta.find((m) => m.name === "robots")?.content,
      ).toBe("index, follow");

      safeEntry.dispose();
      seoEntry.dispose();
      expect(resolveHeadTags().bodyAttrs).toEqual({});

      await preloadComponents(["Header", "Footer"]);
      await prefetchComponents("Sidebar");
      await preloadRouteComponents("/docs");
    });
  });

  test("useNuxtApp, tryUseNuxtApp, defineNuxtComponent, useLoadingIndicator, useRouteAnnouncer, useRequestFetch, onNuxtReady, onPrehydrate, and reloadNuxtApp", async () => {
    const comp = defineNuxtComponent({ name: "MyPage" });
    expect(comp.name).toBe("MyPage");

    await withNuxtRequest(
      {
        url: "https://example.com/dashboard",
        headers: {
          cookie: "auth=secret-cookie",
          authorization: "Bearer token-123",
        },
      },
      async () => {
        const nuxtApp = useNuxtApp();
        expect(tryUseNuxtApp()).toBe(nuxtApp);
        expect(nuxtApp.payload.serverRendered).toBe(true);
        expect(nuxtApp.ssrContext?.url).toBe("/dashboard");

        const counter = useState("visits", () => 7);
        expect(nuxtApp.payload.state.visits).toBe(7);
        nuxtApp.payload.state.visits = 8;
        expect(counter.value).toBe(8);

        await useAsyncData("profile", async () => ({ name: "Ada" }));
        expect(nuxtApp.payload.data.profile).toEqual({ name: "Ada" });

        nuxtApp.provide("analytics", { track: () => "tracked" });
        expect(nuxtApp.$analytics.track()).toBe("tracked");
        expect(() => nuxtApp.provide("analytics", {})).toThrow(
          'Cannot redefine property "$analytics"',
        );

        const finishHydration = nuxtApp.deferHydration();
        expect(nuxtApp.isHydrating).toBe(true);
        finishHydration();
        expect(nuxtApp.isHydrating).toBe(false);

        const indicator = useLoadingIndicator();
        expect(indicator.isLoading.value).toBe(false);
        await nuxtApp.callHook("page:loading:start");
        expect(indicator.isLoading.value).toBe(true);
        indicator.set(45);
        expect(indicator.progress.value).toBe(45);
        await nuxtApp.callHook("page:loading:end");
        expect(indicator.isLoading.value).toBe(false);
        expect(indicator.progress.value).toBe(100);

        useHead({ title: "Dashboard" });
        const announcer = useRouteAnnouncer();
        expect(announcer.message.value).toBe("Dashboard");
        expect(announcer.politeness.value).toBe("polite");
        announcer.assertive("Urgent Alert");
        expect(announcer.message.value).toBe("Urgent Alert");
        expect(announcer.politeness.value).toBe("assertive");
        announcer.off();
        expect(announcer.politeness.value).toBe("off");

        const phId = onPrehydrate(() => {}, "custom-ph");
        expect(phId).toBe("custom-ph");

        // SSR skips onNuxtReady
        let readyRanInSSR = false;
        onNuxtReady(() => {
          readyRanInSSR = true;
        });
        await Promise.resolve();
        expect(readyRanInSSR).toBe(false);

        reloadNuxtApp({ path: "/login", persistState: true });

        const originalFetch = globalThis.fetch;
        let capturedHeaders: Headers | undefined;
        let capturedUrl = "";
        globalThis.fetch = (async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          capturedUrl = String(input);
          capturedHeaders = new Headers(init?.headers);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
          });
        }) as unknown as typeof fetch;

        try {
          const reqFetch = useRequestFetch();
          const res = await reqFetch("/api/me", { query: { detail: 1 } });
          expect(res).toEqual({ ok: true });
          expect(capturedUrl).toBe("https://example.com/api/me?detail=1");
          expect(capturedHeaders?.get("cookie")).toBe("auth=secret-cookie");
          expect(capturedHeaders?.get("authorization")).toBe(
            "Bearer token-123",
          );
        } finally {
          globalThis.fetch = originalFetch;
        }
      },
    );

    // Client-side onNuxtReady runs in microtask with NuxtApp context
    let clientReadyApp: unknown;
    createRoot((dispose) => {
      onNuxtReady(() => {
        clientReadyApp = tryUseNuxtApp();
      });
      dispose();
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(clientReadyApp).toBeDefined();
  });
});
