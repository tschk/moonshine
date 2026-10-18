import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ROUTE_DATA_HEADER,
  ROUTE_DATA_VERSION,
} from "@tschk/moonshine-framework/data-request";
import { redirect } from "../src";
import { createRequestHandler } from "../src/data-http";
import type { RequestHandlerOptions, RouteModule } from "../src";
import { createRequestHandler as createOrdinaryHandler } from "../src";

test("ordinary server entry requires the explicit HTTP transport entry", () => {
  expect(() => createOrdinaryHandler({ dataRequests: true })).toThrow(
    "@tschk/moonshine-server/data-http",
  );
  expect(() =>
    createOrdinaryHandler({
      manifest: { dataRequests: true } as RequestHandlerOptions["manifest"],
    }),
  ).toThrow("@tschk/moonshine-server/data-http");
  expect(() => createOrdinaryHandler({ dataRequests: false })).not.toThrow();
});

const ORIGIN = "http://app.test";
const dataHeaders = (extra: Record<string, string> = {}) => ({
  [ROUTE_DATA_HEADER]: ROUTE_DATA_VERSION,
  ...extra,
});

test("aborted data reads and writes never become successful envelopes", async () => {
  const controller = new AbortController();
  controller.abort();
  for (const method of ["GET", "POST"]) {
    const { handler, counts } = setup({ loader: () => 1, action: () => 2 });
    const response = await handler(
      new Request(`${ORIGIN}/page`, {
        method,
        signal: controller.signal,
        headers: dataHeaders(),
      }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.has(ROUTE_DATA_HEADER)).toBe(false);
    expect(counts.loader).toBe(0);
    expect(counts.action).toBe(0);
  }
  for (const method of ["GET", "POST"]) {
    const active = new AbortController();
    let commits = 0;
    const { handler } = setup({
      loader() {
        active.abort();
        return 1;
      },
      action() {
        commits++;
        active.abort();
        return { saved: true };
      },
    });
    const response = await handler(
      new Request(`${ORIGIN}/page`, {
        method,
        signal: active.signal,
        headers: dataHeaders(),
      }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.has(ROUTE_DATA_HEADER)).toBe(false);
    expect(commits).toBe(method === "POST" ? 1 : 0);
  }
});

function setup(
  module: RouteModule,
  extra: Partial<RequestHandlerOptions> = {},
) {
  const counts = { render: 0, loader: 0, action: 0, before: 0, after: 0 };
  const wrapped: RouteModule = {
    ...module,
    before: [
      async (_ctx, next) => {
        counts.before++;
        return next();
      },
      ...(module.before ?? []),
    ],
    after: [
      async (_ctx, next) => {
        counts.after++;
        return next();
      },
      ...(module.after ?? []),
    ],
    loader: module.loader
      ? async (ctx) => {
          counts.loader++;
          return module.loader!(ctx);
        }
      : undefined,
    action: module.action
      ? async (ctx) => {
          counts.action++;
          return module.action!(ctx);
        }
      : undefined,
  };
  const handler = createRequestHandler({
    dataRequests: true,
    routes: [{ id: "page", path: "/page", file: "page.ts", mode: "ssr" }],
    modules: { page: wrapped },
    renderer: {
      name: "test",
      prerender: async () => "",
      render: async () => {
        counts.render++;
        return new Response("<html>doc</html>", {
          headers: { "content-type": "text/html" },
        });
      },
    },
    ...extra,
  });
  return { handler, counts };
}

const req = (init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request(`${ORIGIN}/page`, init);

test("protocol loads bypass static files and retain the envelope on API routes", async () => {
  const staticDir = await mkdtemp(join(tmpdir(), "moonshine-data-static-"));
  try {
    await writeFile(join(staticDir, "page"), "static document");
    for (const mode of ["static", "api"] as const) {
      const { handler, counts } = setup(
        { loader: () => 3 },
        {
          staticDir,
          routes: [{ id: "page", path: "/page", file: "page.ts", mode }],
        },
      );
      expect(await (await handler(req())).text()).toBe("static document");
      expect(counts.loader).toBe(0);
      const response = await handler(req({ headers: dataHeaders() }));
      expect(response.headers.get(ROUTE_DATA_HEADER)).toBe(ROUTE_DATA_VERSION);
      expect(await response.json()).toEqual({ data: { page: 3 } });
      expect(counts.loader).toBe(1);
      expect(counts.render).toBe(0);
    }
  } finally {
    await rm(staticDir, { recursive: true, force: true });
  }
});

test("disabled handler leaves protocol header inert and adds no Vary", async () => {
  const counts = { render: 0 };
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/page", file: "page.ts", mode: "ssr" }],
    modules: { page: { loader: () => "x" } },
    renderer: {
      name: "test",
      prerender: async () => "",
      render: async () => {
        counts.render++;
        return new Response("<html>doc</html>", {
          headers: { "content-type": "text/html" },
        });
      },
    },
  });
  const res = await handler(
    req({ headers: dataHeaders({ origin: "http://evil.test" }) }),
  );
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("<html>doc</html>");
  expect(res.headers.get("vary")).toBeNull();
  expect(res.headers.get(ROUTE_DATA_HEADER)).toBeNull();
  expect(counts.render).toBe(1);
});

test("manifest opt-in enables the protocol and option overrides it", async () => {
  const routes = [
    { id: "page", path: "/page", file: "page.ts", mode: "ssr" as const },
  ];
  const modules = { page: { loader: () => "x" } };
  const viaManifest = createRequestHandler({
    manifest: {
      version: 1,
      frameworkVersion: "test",
      routes: [],
      assets: [],
      entries: {},
      capabilities: [],
      dataRequests: true,
    },
    routes,
    modules,
  });
  const res = await viaManifest(req({ headers: dataHeaders() }));
  expect(res.headers.get(ROUTE_DATA_HEADER)).toBe(ROUTE_DATA_VERSION);
  const overridden = createRequestHandler({
    manifest: {
      version: 1,
      frameworkVersion: "test",
      routes: [],
      assets: [],
      entries: {},
      capabilities: [],
      dataRequests: true,
    },
    routes,
    dataRequests: false,
    modules,
  });
  const off = await overridden(req({ headers: dataHeaders() }));
  expect(off.headers.get(ROUTE_DATA_HEADER)).toBeNull();
  expect(off.headers.get("vary")).toBeNull();
});

test("enabled handler leaves normal documents unchanged except Vary", async () => {
  const { handler, counts } = setup({ loader: () => ({ a: 1 }) });
  const res = await handler(req());
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("<html>doc</html>");
  expect(res.headers.get("content-type")).toBe("text/html");
  expect(res.headers.get(ROUTE_DATA_HEADER)).toBeNull();
  expect(res.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
  expect(counts).toEqual({
    render: 1,
    loader: 1,
    action: 0,
    before: 1,
    after: 1,
  });
});

test("header must match the version exactly", async () => {
  const { handler, counts } = setup({ loader: () => "x" });
  const res = await handler(req({ headers: { [ROUTE_DATA_HEADER]: "2" } }));
  expect(await res.text()).toBe("<html>doc</html>");
  expect(counts.render).toBe(1);
});

test("GET runs loaders and returns a JSON envelope without rendering", async () => {
  const { handler, counts } = setup({
    loader: () => ({ answer: 42 }),
    headers: { "x-route": "yes" },
  });
  const res = await handler(req({ headers: dataHeaders() }));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(res.headers.get(ROUTE_DATA_HEADER)).toBe(ROUTE_DATA_VERSION);
  expect(res.headers.get("x-route")).toBe("yes");
  expect(res.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
  expect(await res.json()).toEqual({ data: { page: { answer: 42 } } });
  expect(counts).toEqual({
    render: 0,
    loader: 1,
    action: 0,
    before: 1,
    after: 1,
  });
});

test("HEAD runs loaders, carries headers and has no body", async () => {
  const { handler, counts } = setup({ loader: () => "x" });
  const res = await handler(req({ method: "HEAD", headers: dataHeaders() }));
  expect(res.status).toBe(200);
  expect(res.headers.get(ROUTE_DATA_HEADER)).toBe(ROUTE_DATA_VERSION);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(await res.text()).toBe("");
  expect(counts.loader).toBe(1);
  expect(counts.render).toBe(0);
});

test("loader metadata applies on load with JSON content type enforced before after middleware", async () => {
  let seenType: string | null = null;
  const { handler } = setup({
    loader: () => ({
      type: "DataWithResponseInit",
      data: "v",
      init: {
        status: 201,
        headers: {
          "content-type": "text/plain",
          "x-meta": "m",
          "set-cookie": "a=1",
        },
      },
    }),
    after: [
      async (_ctx, next) => {
        const response = await next();
        seenType = response.headers.get("content-type");
        return response;
      },
    ],
  });
  const res = await handler(req({ headers: dataHeaders() }));
  expect(res.status).toBe(201);
  expect(seenType as string | null).toContain("application/json");
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(res.headers.get("x-meta")).toBe("m");
  expect(res.headers.getSetCookie()).toEqual(["a=1"]);
  expect(await res.json()).toEqual({ data: { page: "v" } });
});

test("after middleware may intentionally replace the data response", async () => {
  const { handler } = setup({
    loader: () => "x",
    after: [async () => new Response("custom", { status: 202 })],
  });
  const res = await handler(req({ headers: dataHeaders() }));
  expect(res.status).toBe(202);
  expect(await res.text()).toBe("custom");
  expect(res.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
});

test("POST runs the action and skips loaders, returning the unpacked payload", async () => {
  const { handler, counts } = setup({
    loader: () => "never",
    action: () => ({
      type: "DataWithResponseInit",
      data: { saved: true },
      init: { status: 202, headers: { "set-cookie": "s=1", "x-action": "a" } },
    }),
    headers: { "x-route": "r" },
  });
  const res = await handler(req({ method: "POST", headers: dataHeaders() }));
  expect(res.status).toBe(202);
  expect(res.headers.get(ROUTE_DATA_HEADER)).toBe(ROUTE_DATA_VERSION);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(res.headers.get("x-action")).toBe("a");
  expect(res.headers.get("x-route")).toBe("r");
  expect(res.headers.getSetCookie()).toEqual(["s=1"]);
  expect(await res.json()).toEqual({ data: { saved: true } });
  expect(counts).toEqual({
    render: 0,
    loader: 0,
    action: 1,
    before: 1,
    after: 1,
  });
});

test("every write method runs the action once; undefined normalizes to null", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const { handler, counts } = setup({
      loader: () => "never",
      action: () => undefined,
    });
    const res = await handler(req({ method, headers: dataHeaders() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null });
    expect(counts.action).toBe(1);
    expect(counts.loader).toBe(0);
  }
});

test("action success is independent of later loader failure", async () => {
  let loaderFails = true;
  const { handler, counts } = setup({
    loader: () => {
      if (loaderFails) throw new Error("loader down");
      return "ok";
    },
    action: () => ({ done: 1 }),
  });
  const write = await handler(req({ method: "POST", headers: dataHeaders() }));
  expect(write.status).toBe(200);
  expect(await write.json()).toEqual({ data: { done: 1 } });
  const load = await handler(req({ headers: dataHeaders() }));
  expect(load.status).toBe(500);
  expect(load.headers.get(ROUTE_DATA_HEADER)).toBeNull();
  expect(load.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
  loaderFails = false;
  const again = await handler(req({ headers: dataHeaders() }));
  expect(await again.json()).toEqual({ data: { page: "ok" } });
  expect(counts.action).toBe(1);
  expect(counts.loader).toBe(2);
});

test("ordinary POST without the header still runs action then loaders", async () => {
  const { handler, counts } = setup({
    loader: () => "l",
    action: () => "a",
  });
  const res = await handler(req({ method: "POST" }));
  expect(await res.text()).toBe("<html>doc</html>");
  expect(counts).toEqual({
    render: 1,
    loader: 1,
    action: 1,
    before: 1,
    after: 1,
  });
});

test("write without an action is 405 and does not run loaders", async () => {
  const { handler, counts } = setup({ loader: () => "x" });
  const res = await handler(req({ method: "POST", headers: dataHeaders() }));
  expect(res.status).toBe(405);
  expect(counts.loader).toBe(0);
  expect(res.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
});

test("returned and thrown Responses plus redirects stay native", async () => {
  const returned = setup({
    action: () =>
      new Response("nope", { status: 422, headers: { "x-r": "1" } }),
  });
  const a = await returned.handler(
    req({ method: "POST", headers: dataHeaders() }),
  );
  expect(a.status).toBe(422);
  expect(await a.text()).toBe("nope");
  expect(a.headers.get(ROUTE_DATA_HEADER)).toBeNull();
  expect(a.headers.get("vary")).toBe(ROUTE_DATA_HEADER);

  const thrown = setup({
    loader: () => {
      throw new Response("teapot", { status: 418 });
    },
  });
  const b = await thrown.handler(req({ headers: dataHeaders() }));
  expect(b.status).toBe(418);
  expect(await b.text()).toBe("teapot");
  expect(b.headers.get(ROUTE_DATA_HEADER)).toBeNull();

  const redirected = setup({ loader: () => redirect("/elsewhere", 303) });
  const c = await redirected.handler(req({ headers: dataHeaders() }));
  expect(c.status).toBe(303);
  expect(c.headers.get("location")).toBe("/elsewhere");
  expect(c.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
  expect(c.headers.get(ROUTE_DATA_HEADER)).toBeNull();
});

test("error boundaries stay native HTTP responses", async () => {
  const { handler } = setup({
    loader: () => {
      throw new Error("boom");
    },
    errorBoundary: () => new Response("boundary", { status: 503 }),
  });
  const res = await handler(req({ headers: dataHeaders() }));
  expect(res.status).toBe(503);
  expect(await res.text()).toBe("boundary");
  expect(res.headers.get(ROUTE_DATA_HEADER)).toBeNull();
  expect(res.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
});

test("origin guard rejects before any user callback and only for protocol requests", async () => {
  const rejected: Array<Record<string, string>> = [
    { origin: "http://evil.test" },
    { origin: "null" },
    { origin: "not a url" },
    { origin: ORIGIN + "/path" },
    { origin: ORIGIN + "?query" },
    { origin: "http://user:pass@app.test" },
    { origin: "https://app.test" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
  ];
  for (const headers of rejected) {
    for (const method of ["GET", "POST"]) {
      let scoped = 0;
      const { handler, counts } = setup(
        { loader: () => "x", action: () => "y" },
        {
          requestScope: (_request, fn) => {
            scoped++;
            return fn();
          },
          notFound: () => {
            throw new Error("notFound must not run");
          },
        },
      );
      const res = await handler(req({ method, headers: dataHeaders(headers) }));
      expect(res.status).toBe(403);
      expect(res.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
      expect(counts).toEqual({
        render: 0,
        loader: 0,
        action: 0,
        before: 0,
        after: 0,
      });
      expect(scoped).toBe(0);
    }
  }

  const { handler, counts } = setup({ loader: () => "x" });
  const normal = await handler(
    req({ headers: { origin: "http://evil.test" } }),
  );
  expect(normal.status).toBe(200);
  expect(counts.render).toBe(1);
});

test("origin guard allows same origin, same-origin fetch metadata and non-browser clients", async () => {
  const allowed: Record<string, string>[] = [
    { origin: ORIGIN },
    { "sec-fetch-site": "same-origin" },
    { "sec-fetch-site": "none" },
    {},
  ];
  for (const headers of allowed) {
    const { handler, counts } = setup({ loader: () => "x" });
    const res = await handler(req({ headers: dataHeaders(headers) }));
    expect(res.status).toBe(200);
    expect(counts.loader).toBe(1);
  }
});

test("origin header wins over Sec-Fetch-Site when present", async () => {
  const { handler } = setup({ loader: () => "x" });
  const res = await handler(
    req({
      headers: dataHeaders({ origin: ORIGIN, "sec-fetch-site": "cross-site" }),
    }),
  );
  expect(res.status).toBe(200);
});

test("protocol methods outside the supported set are 405 without callbacks", async () => {
  const { handler, counts } = setup({ loader: () => "x", action: () => "y" });
  const res = await handler(req({ method: "OPTIONS", headers: dataHeaders() }));
  expect(res.status).toBe(405);
  expect(res.headers.get("allow")).toBe("GET, HEAD, POST, PUT, PATCH, DELETE");
  expect(counts).toEqual({
    render: 0,
    loader: 0,
    action: 0,
    before: 0,
    after: 0,
  });
});

test("Vary preserves existing tokens and wildcard on all enabled responses", async () => {
  const merged = setup({
    loader: () => "x",
    headers: { vary: "Accept-Encoding" },
  });
  const doc = await merged.handler(req());
  expect(doc.headers.get("vary")).toBe(`Accept-Encoding, ${ROUTE_DATA_HEADER}`);
  const data = await merged.handler(req({ headers: dataHeaders() }));
  expect(data.headers.get("vary")).toBe(
    `Accept-Encoding, ${ROUTE_DATA_HEADER}`,
  );

  const star = setup({ loader: () => "x", headers: { vary: "*" } });
  expect((await star.handler(req())).headers.get("vary")).toBe("*");

  const already = setup({
    loader: () => "x",
    headers: { vary: "X-Moonshine-Data, Cookie" },
  });
  expect((await already.handler(req())).headers.get("vary")).toBe(
    "X-Moonshine-Data, Cookie",
  );

  const missing = await merged.handler(
    new Request(`${ORIGIN}/missing`, { headers: dataHeaders() }),
  );
  expect(missing.status).toBe(404);
  expect(missing.headers.get("vary")).toBe(`${ROUTE_DATA_HEADER}`);
});

test("Vary is applied after request scope header merge", async () => {
  const { handler } = setup(
    { loader: () => "x" },
    {
      requestScope: (_request, fn, headers) => {
        if (!headers) throw new Error("Missing request-scope headers");
        headers.set("vary", "Cookie");
        headers.append("set-cookie", "scope=1");
        return fn();
      },
    },
  );
  for (const headers of [{}, dataHeaders()]) {
    const res = await handler(req({ headers }));
    expect(res.headers.get("vary")).toBe(`Cookie, ${ROUTE_DATA_HEADER}`);
    expect(res.headers.getSetCookie()).toEqual(["scope=1"]);
  }

  const star = setup(
    { loader: () => "x" },
    {
      requestScope: (_request, fn, headers) => {
        if (!headers) throw new Error("Missing request-scope headers");
        headers.set("vary", "*");
        return fn();
      },
    },
  );
  expect((await star.handler(req())).headers.get("vary")).toBe("*");
});

test("request scope runs once per allowed protocol request and observes callbacks inside it", async () => {
  let scoped = 0;
  const { handler, counts } = setup(
    { loader: () => "x" },
    {
      requestScope: (_request, fn) => {
        scoped++;
        return fn();
      },
    },
  );
  await handler(req({ headers: dataHeaders() }));
  expect(scoped).toBe(1);
  expect(counts.loader).toBe(1);
});

test("origin-rejected HEAD retains headers but has no body", async () => {
  const { handler, counts } = setup({ loader: () => "x" });
  const response = await handler(
    req({
      method: "HEAD",
      headers: dataHeaders({ origin: "http://evil.test" }),
    }),
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("vary")).toBe(ROUTE_DATA_HEADER);
  expect(await response.text()).toBe("");
  expect(counts.loader).toBe(0);
});

test("explicit public origin supports TLS proxy requests without trusting forwarded headers", async () => {
  const { handler, counts } = setup(
    { loader: () => "x", action: () => "saved" },
    { dataRequests: { origin: "https://public.test/" } },
  );
  const accepted = await handler(
    req({
      method: "POST",
      headers: dataHeaders({ origin: "https://public.test" }),
    }),
  );
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toEqual({ data: "saved" });
  expect(counts.action).toBe(1);
  for (const origin of [ORIGIN, "https://evil.test"]) {
    const rejected = await handler(
      req({
        method: "POST",
        headers: dataHeaders({
          origin,
          "x-forwarded-host": "public.test",
          "x-forwarded-proto": "https",
        }),
      }),
    );
    expect(rejected.status).toBe(403);
  }
  expect(counts.action).toBe(1);
  expect(counts.loader).toBe(0);
  const document = await handler(
    req({ headers: { origin: "https://evil.test" } }),
  );
  expect(await document.text()).toBe("<html>doc</html>");
});

test("invalid configured public origins fail before requests run", () => {
  for (const origin of [
    "null",
    "ftp://public.test",
    "https://user:password@public.test",
    "https://public.test/path",
    "https://public.test?query",
    "https://public.test#hash",
  ]) {
    expect(() =>
      setup({ loader: () => "x" }, { dataRequests: { origin } }),
    ).toThrow(TypeError);
  }
});

test("untyped malformed opt-ins reject instead of enabling data endpoints", () => {
  for (const dataRequests of [
    "false",
    1,
    null,
    [],
    {},
    { origin: 1 },
    { origin: "https://public.test", extra: "private" },
  ]) {
    const options = JSON.parse(JSON.stringify({ dataRequests }));
    expect(() => createRequestHandler(options)).toThrow(TypeError);
  }
});
