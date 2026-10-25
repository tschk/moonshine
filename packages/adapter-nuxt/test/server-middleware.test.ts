import { describe, expect, test } from "bun:test";
import {
  abortNavigation,
  addRouteMiddleware,
  defineAppConfig,
  defineNuxtRouteMiddleware,
  definePayloadReducer,
  definePayloadReviver,
  reviveNuxtPayload,
  serializeNuxtPayload,
  useHydration,
  useNuxtApp,
  usePreviewMode,
  useResponseHeader,
  useRoute,
  useRouter,
  useState,
  withNuxtRequest,
} from "../src/composables";
import {
  appendHeader,
  assertMethod,
  defineEventHandler,
  defineLazyEventHandler,
  deleteCookie,
  eventHandler,
  getCookie,
  getHeader,
  getHeaders,
  getMethod,
  getRequestURL,
  getResponseHeader,
  getResponseHeaders,
  getResponseStatus,
  getRouterParam,
  getValidatedQuery,
  getValidatedRouterParams,
  handleCacheHeaders,
  isEvent,
  isMethod,
  parseCookies,
  readBody,
  readFormData,
  readRawBody,
  readValidatedBody,
  removeResponseHeader,
  sendNoContent,
  sendRedirect,
  setCookie,
  setHeader,
  setHeaders,
} from "../src/server";

describe("Nuxt route middleware, payload reducers/revivers, preview mode, response header, and hydration", () => {
  test("addRouteMiddleware registers global and named middlewares executed during navigation", async () => {
    await withNuxtRequest({ url: "https://example.com/" }, async () => {
      const trace: string[] = [];
      const router = useRouter();
      router.addRoute({
        name: "admin",
        path: "/admin",
        meta: { middleware: ["auth", "audit"] },
      });
      router.addRoute({
        name: "denied",
        path: "/denied",
        meta: { middleware: "block" },
      });

      addRouteMiddleware((to) => {
        trace.push(`global:${to.path}`);
      });

      addRouteMiddleware(
        "global-named",
        defineNuxtRouteMiddleware((to) => {
          trace.push(`global-named:${to.path}`);
        }),
        { global: true },
      );

      addRouteMiddleware("auth", (to) => {
        trace.push(`auth:${to.path}`);
      });

      addRouteMiddleware("audit", (to) => {
        trace.push(`audit:${to.path}`);
      });

      addRouteMiddleware("block", () => {
        return abortNavigation();
      });

      await router.push("/admin");
      expect(useRoute().path).toBe("/admin");
      expect(trace).toEqual([
        "global:/admin",
        "global-named:/admin",
        "auth:/admin",
        "audit:/admin",
      ]);

      const blocked = await router.push("/denied");
      expect((blocked as any)?.type).toBe("aborted");
      expect(useRoute().path).toBe("/admin");
    });
  });

  test("definePayloadReducer, definePayloadReviver, serializeNuxtPayload, and reviveNuxtPayload", async () => {
    class CustomUrl {
      constructor(public readonly href: string) {}
    }

    let serialized = "";
    await withNuxtRequest({ url: "https://example.com/ssr" }, () => {
      definePayloadReducer(
        "CustomUrl",
        (val) => val instanceof CustomUrl && val.href,
      );
      const state = useState(
        "endpoint",
        () => new CustomUrl("https://api.example.com"),
      );
      expect(state.value.href).toBe("https://api.example.com");
      serialized = serializeNuxtPayload();
    });

    expect(serialized).toContain('"__nuxt_type":"CustomUrl"');

    await withNuxtRequest({ url: "https://example.com/ssr" }, () => {
      definePayloadReviver("CustomUrl", (href: string) => new CustomUrl(href));
      const revived = reviveNuxtPayload(serialized);
      expect(revived.state.endpoint).toBeInstanceOf(CustomUrl);
      expect(revived.state.endpoint.href).toBe("https://api.example.com");
      expect(useState<CustomUrl>("endpoint").value).toBeInstanceOf(CustomUrl);
    });
  });

  test("usePreviewMode, useResponseHeader, useHydration, and defineAppConfig", async () => {
    const cfg = defineAppConfig({ theme: "dark", version: 2 });
    expect(cfg).toEqual({ theme: "dark", version: 2 });

    await withNuxtRequest(
      { url: "https://example.com/post?preview=true" },
      async (event) => {
        let enabledCount = 0;
        let disabledCount = 0;
        const preview = usePreviewMode<{ token: string }>({
          getState: () => ({ token: "secret-preview-token" }),
          onEnable: () => {
            enabledCount++;
          },
          onDisable: () => {
            disabledCount++;
          },
        });
        expect(preview.enabled.value).toBe(true);
        expect(preview.state.token).toBe("secret-preview-token");
        expect(enabledCount).toBe(1);

        preview.enabled.value = false;
        expect(preview.enabled.value).toBe(false);
        expect(disabledCount).toBe(1);

        const cacheControl = useResponseHeader("Cache-Control");
        expect(cacheControl.value).toBeUndefined();
        cacheControl.value = "max-age=60";
        expect(event.responseHeaders.get("Cache-Control")).toBe("max-age=60");
        cacheControl.value = undefined;
        expect(event.responseHeaders.get("Cache-Control")).toBeNull();

        let currentTheme = "solarized";
        useHydration(
          "colorMode",
          () => currentTheme,
          () => {},
        );
        expect((useNuxtApp().payload as any).colorMode).toBe("solarized");
        currentTheme = "dracula";
        await useNuxtApp().callHook("app:rendered");
        expect((useNuxtApp().payload as any).colorMode).toBe("dracula");
      },
    );
  });
});

describe("Nitro / h3 host-free server utilities (@tschk/moonshine-nuxt/server)", () => {
  test("defineEventHandler, eventHandler, and defineLazyEventHandler with query, params, headers, and cookies", async () => {
    const handler = defineEventHandler({
      onRequest(event) {
        setHeader(event, "x-request-hook", "ran");
      },
      async handler(event) {
        expect(isEvent(event)).toBe(true);
        expect(getMethod(event)).toBe("POST");
        expect(isMethod(event, ["GET", "POST"])).toBe(true);
        assertMethod(event, "POST");
        const query = await getValidatedQuery(event, (q) => ({
          page: Number(q.page ?? 1),
          tag: q.tag,
        }));
        const params = await getValidatedRouterParams(event, (p) => ({
          id: p.id!,
        }));
        const body = await readValidatedBody(event, (b: any) => ({
          title: String(b.title).toUpperCase(),
        }));
        const incomingCookie = getCookie(event, "session");
        setCookie(event, "theme", "dark", { httpOnly: true, path: "/" });
        deleteCookie(event, "legacy");
        appendHeader(event, "x-custom", ["a", "b"]);
        return {
          url: getRequestURL(event, {
            xForwardedHost: true,
            xForwardedProto: true,
          }).href,
          query,
          params,
          body,
          incomingCookie,
          reqHeader: getHeader(event, "x-forwarded-host"),
        };
      },
      onBeforeResponse(event) {
        setHeaders(event, { "x-after-hook": "done" });
      },
    });

    const req = new Request(
      "http://localhost/api/items/42?page=3&tag=news&tag=tech",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "session=abc123; legacy=old",
          "x-forwarded-host": "api.example.com",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ title: "hello world" }),
      },
    );

    const result = await handler({
      request: req,
      url: req.url,
      headers: req.headers,
      context: { params: { id: "42" } },
    } as any);

    expect(result).toEqual({
      url: "https://api.example.com/api/items/42?page=3&tag=news&tag=tech",
      query: { page: 3, tag: ["news", "tech"] },
      params: { id: "42" },
      body: { title: "HELLO WORLD" },
      incomingCookie: "abc123",
      reqHeader: "api.example.com",
    });

    const lazy = defineLazyEventHandler(async () =>
      eventHandler((ev) => ({
        id: getRouterParam(ev, "id"),
        cookies: parseCookies(ev),
      })),
    );
    const lazyRes = await lazy({
      url: "https://example.com/users/99",
      headers: { cookie: "a=1; b=2" },
      context: { params: { id: "99" } },
    } as any);
    expect(lazyRes).toEqual({ id: "99", cookies: { a: "1", b: "2" } });
  });

  test("readRawBody, readBody urlencoded, readFormData, sendRedirect, sendNoContent, and handleCacheHeaders", async () => {
    const formUrlReq = new Request("https://example.com/submit", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=Ada&role=admin&role=staff",
    });
    await withNuxtRequest(formUrlReq, async (ev) => {
      const parsed = await readBody(ev);
      expect(parsed).toEqual({ name: "Ada", role: ["admin", "staff"] });
      const raw = await readRawBody(ev);
      expect(raw).toBe("name=Ada&role=admin&role=staff");
    });

    const fd = new FormData();
    fd.set("field", "value1");
    const fdReq = new Request("https://example.com/upload", {
      method: "POST",
      body: fd,
    });
    await withNuxtRequest(fdReq, async () => {
      const data = await readFormData();
      expect(data.get("field")).toBe("value1");
    });

    await withNuxtRequest(
      {
        url: "https://example.com/resource",
        headers: { "if-none-match": 'W/"v1"' },
      },
      (ev) => {
        expect(getHeaders()["if-none-match"]).toBe('W/"v1"');
        const hit = handleCacheHeaders(ev, { maxAge: 120, etag: 'W/"v1"' });
        expect(hit).toBe(true);
        expect(getResponseStatus(ev)).toBe(304);
        expect(getResponseHeader(ev, "cache-control")).toContain("max-age=120");

        setHeader(ev, "x-temp", "1");
        expect(getResponseHeaders(ev)["x-temp"]).toBe("1");
        removeResponseHeader(ev, "x-temp");
        expect(getResponseHeader(ev, "x-temp")).toBeUndefined();

        const redirectRes = sendRedirect(ev, "/login", 307);
        expect(redirectRes.status).toBe(307);
        expect(redirectRes.headers.get("location")).toBe("/login");

        const noContentRes = sendNoContent(ev);
        expect(noContentRes.status).toBe(204);
      },
    );
  });
});
