import { describe, expect, test } from "bun:test";
import {
  createEnvironmentInjector,
  HTTP_INTERCEPTORS,
  HttpClient,
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpEventType,
  HttpHeaders,
  HttpParams,
  HttpRequest,
  HttpResponse,
  HttpStatusCode,
  httpResource,
  inject,
  PendingTasks,
  provideHttpClient,
  rxResource,
  signal,
  toSignal,
  withFetch,
  withInterceptors,
  withInterceptorsFromDi,
  type HttpInterceptor,
  type HttpInterceptorFn,
} from "../src";

describe("@tschk/moonshine-angular/http", () => {
  test("HttpHeaders provides immutable case-insensitive header operations", () => {
    const h0 = new HttpHeaders("Content-Type: application/json\nX-Custom: one");
    expect(h0.has("content-type")).toBe(true);
    expect(h0.get("CONTENT-TYPE")).toBe("application/json");
    expect(h0.get("x-custom")).toBe("one");

    const h1 = h0.append("x-custom", "two");
    expect(h0.getAll("x-custom")).toEqual(["one"]);
    expect(h1.getAll("X-Custom")).toEqual(["one", "two"]);

    const h2 = h1.set("X-Custom", "replaced");
    expect(h2.getAll("x-custom")).toEqual(["replaced"]);

    const h3 = h1.delete("x-custom", "one");
    expect(h3.getAll("x-custom")).toEqual(["two"]);

    const h4 = h3.delete("x-custom");
    expect(h4.has("x-custom")).toBe(false);
  });

  test("HttpParams provides immutable query string parsing, encoding, and mutation", () => {
    const p0 = new HttpParams({ fromString: "?search=moonshine&tag=a&tag=b" });
    expect(p0.get("search")).toBe("moonshine");
    expect(p0.getAll("tag")).toEqual(["a", "b"]);
    expect(p0.keys()).toEqual(["search", "tag"]);

    const p1 = p0.append("tag", "c").set("page", 2);
    expect(p0.getAll("tag")).toEqual(["a", "b"]);
    expect(p1.getAll("tag")).toEqual(["a", "b", "c"]);
    expect(p1.get("page")).toBe("2");
    expect(p1.toString()).toBe("search=moonshine&tag=a&tag=b&tag=c&page=2");

    const p2 = p1.delete("tag", "b");
    expect(p2.getAll("tag")).toEqual(["a", "c"]);

    const pFromObj = new HttpParams({
      fromObject: { filter: ["active", "verified"], limit: 10 },
    });
    expect(pFromObj.toString()).toBe("filter=active&filter=verified&limit=10");
  });

  test("HttpContext and HttpContextToken store typed per-request metadata", () => {
    const RETRY_COUNT = new HttpContextToken(() => 3);
    const AUTH_SCOPE = new HttpContextToken(() => "public");
    const ctx = new HttpContext();

    expect(ctx.has(RETRY_COUNT)).toBe(false);
    expect(ctx.get(RETRY_COUNT)).toBe(3);
    expect(ctx.has(RETRY_COUNT)).toBe(true);

    ctx.set(AUTH_SCOPE, "admin");
    expect(ctx.get(AUTH_SCOPE)).toBe("admin");
    ctx.delete(AUTH_SCOPE);
    expect(ctx.has(AUTH_SCOPE)).toBe(false);
  });

  test("HttpRequest clones with setHeaders, setParams, and detects content types", () => {
    const req = new HttpRequest("POST", "/api/items", { title: "hello" });
    expect(req.detectContentTypeHeader()).toBe("application/json");
    expect(req.serializeBody()).toBe('{"title":"hello"}');

    const cloned = req.clone({
      setHeaders: { Authorization: "Bearer token-123" },
      setParams: { draft: "true" },
    });
    expect(cloned.headers.get("authorization")).toBe("Bearer token-123");
    expect(cloned.urlWithParams).toBe("/api/items?draft=true");
  });

  test("HttpClient executes requests through functional and DI interceptors and tracks PendingTasks", async () => {
    const seenUrls: string[] = [];
    const seenAuth: (string | null)[] = [];
    const TOKEN = new HttpContextToken(() => "v1");

    const customFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      seenUrls.push(url);
      const headers = new Headers(init?.headers);
      seenAuth.push(headers.get("x-auth"));
      if (url.includes("/fail")) {
        return new Response(JSON.stringify({ message: "Forbidden" }), {
          status: HttpStatusCode.Forbidden,
          statusText: "Forbidden",
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          url,
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : null,
          apiVersion: headers.get("x-api-version"),
        }),
        {
          status: HttpStatusCode.Ok,
          statusText: "OK",
          headers: { "content-type": "application/json", "x-server": "bun" },
        },
      );
    }) as unknown as typeof fetch;

    const authInterceptor: HttpInterceptorFn = (req, next) => {
      return next(
        req.clone({
          setHeaders: {
            "x-auth": "secret-jwt",
            "x-api-version": req.context.get(TOKEN),
          },
        }),
      );
    };

    const legacyInterceptor: HttpInterceptor = {
      intercept(req, next) {
        return next.handle(
          req.clone({
            setParams: { legacy: "1" },
          }),
        );
      },
    };

    const env = createEnvironmentInjector([
      {
        provide: HTTP_INTERCEPTORS,
        useValue: legacyInterceptor,
        multi: true,
      },
      provideHttpClient(
        withFetch(customFetch),
        withInterceptors([authInterceptor]),
        withInterceptorsFromDi(),
      ),
    ]);

    const client = env.get(HttpClient);
    const pendingTasks = env.get(PendingTasks);

    const ctx = new HttpContext().set(TOKEN, "v2");
    const result = await client.post<{
      ok: boolean;
      url: string;
      method: string;
      body: { name: string };
      apiVersion: string;
    }>(
      "/api/users",
      { name: "Ada" },
      { params: { role: "eng" }, context: ctx },
    );

    expect(result).toEqual({
      ok: true,
      url: "/api/users?role=eng&legacy=1",
      method: "POST",
      body: { name: "Ada" },
      apiVersion: "v2",
    });
    expect(seenAuth).toEqual(["secret-jwt"]);
    expect(pendingTasks.hasPendingTasks()).toBe(false);

    // Full HttpResponse observation
    const fullResp = await client.get<{ ok: boolean }>("/api/ping", {
      observe: "response",
    });
    expect(fullResp).toBeInstanceOf(HttpResponse);
    expect(fullResp.status).toBe(200);
    expect(fullResp.headers.get("x-server")).toBe("bun");
    expect(fullResp.body?.ok).toBe(true);

    // Error handling produces HttpErrorResponse
    let caughtError: unknown;
    try {
      await client.get("/api/fail");
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeInstanceOf(HttpErrorResponse);
    expect((caughtError as HttpErrorResponse).status).toBe(403);
    expect((caughtError as HttpErrorResponse).error).toEqual({
      message: "Forbidden",
    });

    env.destroy();
  });

  test("HttpClient integrates with toSignal() and rxResource()", async () => {
    const customFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(JSON.stringify({ item: url }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const env = createEnvironmentInjector([
      provideHttpClient(withFetch(customFetch)),
    ]);

    const idSig = signal("alpha");
    const rxRes = env.runInContext(() => {
      const http = inject(HttpClient);
      return rxResource({
        request: () => idSig(),
        loader: ({ request }) =>
          http.get<{ item: string }>(`/items/${request}`),
      });
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(rxRes.status()).toBe("resolved");
    expect(rxRes.value()).toEqual({ item: "/items/alpha" });

    const sigVal = env.runInContext(() => {
      const http = inject(HttpClient);
      return toSignal(http.get<{ item: string }>("/items/direct"), {
        initialValue: { item: "loading" },
      });
    });
    expect(sigVal()).toEqual({ item: "loading" });
    await new Promise((r) => setTimeout(r, 10));
    expect(sigVal()).toEqual({ item: "/items/direct" });

    rxRes.destroy();
    env.destroy();
  });

  test("httpResource reactively fetches JSON, text, headers, statusCode, progress, and supports parse/reload", async () => {
    let callCount = 0;
    const customFetch = (async (input: RequestInfo | URL) => {
      callCount++;
      const url = String(input);
      if (url.endsWith("/text")) {
        return new Response(`plain:${callCount}`, {
          status: 201,
          headers: { "x-mode": "text" },
        });
      }
      return new Response(JSON.stringify({ url, count: callCount }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-call": String(callCount),
        },
      });
    }) as unknown as typeof fetch;

    const env = createEnvironmentInjector([
      provideHttpClient(withFetch(customFetch)),
    ]);

    const userId = signal<string | undefined>("u1");
    const userRes = httpResource(
      () =>
        userId()
          ? {
              url: `/users/${userId()}`,
              params: { active: true },
              reportProgress: true,
            }
          : undefined,
      {
        injector: env,
        defaultValue: { label: "none", count: 0 },
        parse: (raw: any) => ({
          label: `${raw.url}#${raw.count}`,
          count: raw.count,
        }),
      },
    );

    await new Promise((r) => setTimeout(r, 15));
    expect(userRes.status()).toBe("resolved");
    expect(userRes.hasValue()).toBe(true);
    expect(userRes.value()).toEqual({
      label: "/users/u1?active=true#1",
      count: 1,
    });
    expect(userRes.statusCode()).toBe(200);
    expect(userRes.headers()?.get("x-call")).toBe("1");
    expect(userRes.progress()?.type).toBe(HttpEventType.DownloadProgress);

    // Reactive parameter change
    userId.set("u2");
    await new Promise((r) => setTimeout(r, 15));
    expect(userRes.value()).toEqual({
      label: "/users/u2?active=true#2",
      count: 2,
    });
    expect(userRes.headers()?.get("x-call")).toBe("2");

    // Manual reload
    expect(userRes.reload()).toBe(true);
    await new Promise((r) => setTimeout(r, 15));
    expect(userRes.value().count).toBe(3);

    // Idle when request returns undefined
    userId.set(undefined);
    expect(userRes.status()).toBe("idle");
    expect(userRes.value()).toEqual({ label: "none", count: 0 });

    // httpResource.text variant
    const textRes = httpResource.text(() => "/notes/text", { injector: env });
    await new Promise((r) => setTimeout(r, 15));
    expect(textRes.status()).toBe("resolved");
    expect(textRes.value()).toBe("plain:4");
    expect(textRes.statusCode()).toBe(201);
    expect(textRes.headers()?.get("x-mode")).toBe("text");

    userRes.destroy();
    textRes.destroy();
    env.destroy();
  });
});
