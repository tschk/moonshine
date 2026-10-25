import { describe, expect, test } from "bun:test";
import { createRouteGraph } from "@tschk/moonshine-router";
import { redirect, createRequestHandler, json } from "../src";

function graph(routes: Parameters<typeof createRouteGraph>[0]) {
  return createRouteGraph(routes);
}

function renderer(name: string, fn: (data: unknown) => Response) {
  return {
    name,
    render: async (ctx: { data: unknown }) => fn(ctx.data),
    prerender: async () => "",
  };
}

test("endpoint methods reject unsupported reads and writes before loaders or actions", async () => {
  let loads = 0;
  let actions = 0;
  const handler = createRequestHandler({
    routes: [{ id: "endpoint", path: "/", file: "endpoint.ts", mode: "api" }],
    modules: {
      endpoint: {
        methods: ["PUT"],
        loader: () => {
          loads++;
        },
        action: () => {
          actions++;
          return new Response("updated");
        },
      },
    },
  });
  for (const method of ["GET", "HEAD", "POST", "DELETE", "OPTIONS"]) {
    const response = await handler(
      new Request("http://localhost/", { method }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("PUT");
    expect(await response.text()).toBe("");
  }
  expect(loads).toBe(0);
  expect(actions).toBe(0);
  const response = await handler(
    new Request("http://localhost/", { method: "PUT" }),
  );
  expect(await response.text()).toBe("updated");
  expect(actions).toBe(1);
  expect(loads).toBe(0);
});

describe("createRequestHandler", () => {
  test("middleware order root before -> child before -> loader -> child after -> root after", async () => {
    const order: string[] = [];
    const routes = graph([
      { id: "root", path: "/", file: "root.tsx" },
      { id: "child", path: "/child", file: "child.tsx", layouts: ["root"] },
    ]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        root: {
          before: [
            async (_ctx, next) => {
              order.push("root-before");
              return next();
            },
          ],
          after: [
            async (_ctx, next) => {
              const res = await next();
              order.push("root-after");
              return res;
            },
          ],
        },
        child: {
          before: [
            async (_ctx, next) => {
              order.push("child-before");
              return next();
            },
          ],
          loader: () => {
            order.push("loader");
            return { ok: true };
          },
          after: [
            async (_ctx, next) => {
              const res = await next();
              order.push("child-after");
              return res;
            },
          ],
        },
      },
      renderer: renderer("test", (data) => {
        order.push("render");
        return json(data, { status: 200 });
      }),
    });

    const res = await handler(new Request("http://x/child"));
    expect(res.status).toBe(200);
    expect(order).toEqual([
      "root-before",
      "child-before",
      "loader",
      "render",
      "child-after",
      "root-after",
    ]);
  });

  test("respects abort signal during loader and does not render", async () => {
    let rendered = false;
    const ac = new AbortController();
    const routes = graph([{ id: "home", path: "/", file: "home.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        home: {
          loader: async (ctx) => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            if (ctx.signal.aborted) throw new Error("aborted");
            return { ok: true };
          },
        },
      },
      renderer: renderer("test", () => {
        rendered = true;
        return new Response("ok");
      }),
    });

    const req = new Request("http://x/", { signal: ac.signal });
    setTimeout(() => ac.abort(), 5);

    const res = await handler(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
    expect(rendered).toBe(false);
  });

  test("thrown redirect preserves status and location", async () => {
    const routes = graph([{ id: "from", path: "/from", file: "from.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        from: {
          loader: () => redirect("/to", 301),
        },
      },
    });

    const res = await handler(new Request("http://x/from"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/to");
  });

  test("blocks unsafe redirects (open redirect bypass)", async () => {
    const routes = graph([{ id: "from", path: "/from", file: "from.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      defaultMeta: {
        headers: {
          "content-type": "text/custom",
          "set-cookie": "blocked=1; Path=/",
        },
      },
      modules: {
        from: {
          loader: () => redirect("//evil.com", 302),
        },
      },
    });

    const res = await handler(new Request("http://x/from"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid redirect");
    const head = await handler(
      new Request("http://x/from", { method: "HEAD" }),
    );
    expect(head.status).toBe(400);
    expect(head.body).toBeNull();
    expect(await head.text()).toBe("");
    expect(head.headers.get("content-type")).toBe("text/custom");
    expect(head.headers.getSetCookie()).toEqual(["blocked=1; Path=/"]);
  });

  test("blocks backslash bypass redirects", async () => {
    const routes = graph([{ id: "from", path: "/from", file: "from.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        from: {
          loader: () => redirect("\\\\evil.com", 302),
        },
      },
    });

    const res = await handler(new Request("http://x/from"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid redirect");
  });

  test("nearest error boundary catches loader errors", async () => {
    const routes = graph([
      { id: "root", path: "/", file: "root.tsx" },
      { id: "child", path: "/child", file: "child.tsx", layouts: ["root"] },
    ]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        root: {
          errorBoundary: (_ctx, err) =>
            new Response(
              `root:${err instanceof Error ? err.message : String(err)}`,
              { status: 500 },
            ),
        },
        child: {
          loader: () => {
            throw new Error("child fail");
          },
          errorBoundary: (_ctx, err) =>
            new Response(
              `child:${err instanceof Error ? err.message : String(err)}`,
              { status: 500 },
            ),
        },
      },
    });

    const res = await handler(new Request("http://x/child"));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("child:child fail");
  });

  test("production error response omits message and stack", async () => {
    const routes = graph([{ id: "err", path: "/err", file: "err.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      mode: "production",
      modules: {
        err: {
          loader: () => {
            throw new Error("secret");
          },
        },
      },
    });

    const res = await handler(new Request("http://x/err"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Server Error");
    expect(body.stack).toBeUndefined();
  });

  test("API route returns json", async () => {
    const routes = graph([
      { id: "api", path: "/api", file: "api.server.ts", mode: "api" },
    ]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        api: {
          loader: () => ({ ok: true }),
        },
      },
    });

    const res = await handler(new Request("http://x/api"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ api: { ok: true } });
  });

  test("POST runs action before loader", async () => {
    const order: string[] = [];
    const routes = graph([{ id: "post", path: "/post", file: "post.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        post: {
          action: () => {
            order.push("action");
            return { posted: true };
          },
          loader: (ctx) => {
            order.push("loader");
            return { action: ctx.data.__action };
          },
        },
      },
      renderer: renderer("test", (data) => json(data)),
    });

    const res = await handler(new Request("http://x/post", { method: "POST" }));
    expect(await res.json()).toEqual({
      post: { action: { posted: true } },
      __action: { posted: true },
    });
    expect(order).toEqual(["action", "loader"]);
  });

  test("headers merge root to leaf", async () => {
    const routes = graph([
      { id: "root", path: "/", file: "root.tsx" },
      { id: "leaf", path: "/leaf", file: "leaf.tsx", layouts: ["root"] },
    ]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        root: { headers: { "x-foo": "root" } },
        leaf: {
          headers: { "x-foo": "leaf" },
          loader: () => ({ ok: true }),
        },
      },
      renderer: renderer("test", () => new Response("ok")),
    });

    const res = await handler(new Request("http://x/leaf"));
    expect(res.headers.get("x-foo")).toBe("leaf");
  });

  test("static traversal serves or blocks", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ms-srv-static-"));
    await fs.writeFile(path.join(dir, "ok.txt"), "ok");

    const routes = graph([{ id: "home", path: "/", file: "home.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {},
      staticDir: dir,
    });

    const ok = await handler(new Request("http://x/ok.txt"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("ok");

    const head = await handler(
      new Request("http://x/ok.txt", { method: "HEAD" }),
    );
    expect(head.body).toBeNull();
    expect(head.headers.get("content-length")).toBe("2");
    expect(head.headers.get("content-type")).toBe(
      ok.headers.get("content-type"),
    );

    const blocked = await handler(new Request("http://x/../etc/passwd"));
    expect(blocked.status).toBe(404);
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("unmatched route returns 404", async () => {
    const routes = graph([{ id: "home", path: "/", file: "home.tsx" }]);
    const handler = createRequestHandler({ graph: routes, modules: {} });
    const res = await handler(new Request("http://x/missing"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });
  test("rejects non-GET methods on a leaf with no action", async () => {
    let loaderRuns = 0;
    const routes = graph([{ id: "p", path: "/p", file: "p.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      modules: {
        p: {
          loader: () => {
            loaderRuns++;
            return { secret: "loaded" };
          },
        },
      },
    });

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await handler(new Request("http://x/p", { method }));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("GET, HEAD");
      expect(await res.text()).not.toContain("loaded");
    }
    expect(loaderRuns).toBe(0);

    const ok = await handler(new Request("http://x/p"));
    expect(ok.status).toBe(200);
    expect(loaderRuns).toBe(1);
  });

  test("advertises action methods in Allow when the leaf has an action", async () => {
    const routes = graph([{ id: "p", path: "/p", file: "p.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      modules: { p: { action: () => ({ ok: true }) } },
    });

    const res = await handler(new Request("http://x/p", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ p: { ok: true } });
  });

  test("HEAD returns the GET headers with no body", async () => {
    const routes = graph([{ id: "p", path: "/p", file: "p.tsx" }]);
    const handler = createRequestHandler({
      graph: routes,
      modules: { p: { loader: () => ({ secret: "loaded" }) } },
    });

    const get = await handler(new Request("http://x/p"));
    const head = await handler(new Request("http://x/p", { method: "HEAD" }));

    expect(head.status).toBe(get.status);
    expect(head.headers.get("content-type")).toBe(
      get.headers.get("content-type"),
    );
    expect(head.body).toBeNull();
    expect(await head.text()).toBe("");
  });
});

test("returned loader responses use chain order, preserve middleware and never render", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let rendered = false;
  let responseStored = false;
  const handler = createRequestHandler({
    routes: [
      {
        id: "page",
        path: "/page",
        file: "page.ts",
        mode: "ssr",
        layouts: ["layout"],
      },
    ],
    defaultMeta: { headers: { "x-default": "kept" } },
    modules: {
      layout: {
        headers: { "x-layout": "kept" },
        loader: async () => {
          await gate;
          return new Response("login", {
            status: 302,
            headers: { location: "/login", "x-loader": "kept" },
          });
        },
        after: [
          async (ctx, next) => {
            responseStored = Object.values(ctx.data).some(
              (value) => value instanceof Response,
            );
            const result = await next();
            result.headers.set("x-after", "kept");
            return result;
          },
        ],
      },
      page: {
        loader: () => {
          release();
          return new Response("missing", { status: 404 });
        },
      },
    },
    renderer: renderer("test", () => {
      rendered = true;
      return new Response("rendered");
    }),
  });
  const result = await handler(new Request("http://localhost/page"));
  expect(result.status).toBe(302);
  expect(result.headers.get("location")).toBe("/login");
  expect(await result.text()).toBe("login");
  for (const name of ["x-default", "x-layout", "x-loader", "x-after"])
    expect(result.headers.get(name)).toBe("kept");
  expect(rendered).toBe(false);
  expect(responseStored).toBe(false);
});

test("returned leaf 404 preserves headers and HEAD strips its body", async () => {
  const handler = createRequestHandler({
    routes: [
      {
        id: "page",
        path: "/",
        file: "page.ts",
        mode: "ssr",
        layouts: ["layout"],
      },
    ],
    modules: {
      layout: { loader: () => ({ title: "ok" }) },
      page: {
        loader: () =>
          new Response("not found", {
            status: 404,
            headers: { "x-leaf": "yes" },
          }),
      },
    },
    renderer: renderer("test", () => {
      throw new Error("must not render");
    }),
  });
  const get = await handler(new Request("http://localhost/"));
  expect(get.status).toBe(404);
  expect(await get.text()).toBe("not found");
  const head = await handler(
    new Request("http://localhost/", { method: "HEAD" }),
  );
  expect(head.status).toBe(404);
  expect(head.headers.get("x-leaf")).toBe("yes");
  expect(await head.text()).toBe("");
});

test("returned action responses take precedence without starting loaders", async () => {
  let loaded = false;
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.ts", mode: "ssr" }],
    modules: {
      page: {
        action: () => new Response("invalid form", { status: 422 }),
        loader: () => {
          loaded = true;
          return new Response("redirect", { status: 302 });
        },
      },
    },
  });
  const response = await handler(
    new Request("http://localhost/", { method: "POST" }),
  );
  expect(response.status).toBe(422);
  expect(await response.text()).toBe("invalid form");
  expect(loaded).toBe(false);
});

test("an abort still wins over a loader returning a response", async () => {
  const controller = new AbortController();
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.ts", mode: "ssr" }],
    modules: {
      page: {
        loader: () => {
          controller.abort();
          return new Response("must not escape", { status: 404 });
        },
      },
    },
  });
  const result = await handler(
    new Request("http://localhost/", { signal: controller.signal }),
  );
  expect(result.status).toBe(500);
  expect(await result.json()).toEqual({ error: "Internal Server Error" });
});

test("unmatched and unconfigured HEAD responses preserve GET metadata without a body", async () => {
  for (const options of [
    {},
    { routes: [] },
    {
      routes: [],
      notFound: () =>
        new Response("custom missing", {
          status: 404,
          headers: { "content-length": "14", "x-missing": "custom" },
        }),
    },
  ]) {
    const handler = createRequestHandler({
      ...options,
      defaultMeta: { headers: { "x-default": "retained" } },
    });
    const get = await handler(new Request("http://localhost/missing"));
    const head = await handler(
      new Request("http://localhost/missing", { method: "HEAD" }),
    );
    expect(head.status).toBe(get.status);
    expect([...head.headers]).toEqual([...get.headers]);
    expect(head.headers.get("x-default")).toBe("retained");
    expect(head.body).toBeNull();
    expect(await head.text()).toBe("");
    expect(await get.text()).not.toBe("");
  }
});

test("response finalization preserves separate cookies across header sources and HEAD", async () => {
  const cookies = [
    "default-a=1; Path=/",
    "default-b=2; Path=/",
    "layout=3; Path=/",
    "page=4; Path=/",
    "session=5; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/; HttpOnly",
    "csrf=6; Path=/; SameSite=Lax",
  ];
  for (const defaults of [
    new Headers([
      ["set-cookie", cookies[0]!],
      ["set-cookie", cookies[1]!],
    ]),
    [
      ["Set-Cookie", cookies[0]!],
      ["set-cookie", cookies[1]!],
    ],
  ] as HeadersInit[]) {
    const handler = createRequestHandler({
      routes: [
        {
          id: "page",
          path: "/",
          file: "page.ts",
          mode: "api",
          layouts: ["layout"],
        },
      ],
      defaultMeta: { headers: defaults },
      modules: {
        layout: {
          headers: { "set-cookie": cookies[2]!, "x-source": "layout" },
        },
        page: {
          headers: { "Set-Cookie": cookies[3]!, "x-source": "page" },
          loader: () =>
            new Response("saved", {
              headers: [
                ["set-cookie", cookies[4]!],
                ["set-cookie", cookies[5]!],
                ["x-source", "response"],
              ],
            }),
        },
      },
    });
    const server = Bun.serve({ port: 0, fetch: handler });
    try {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(server.url, { method });
        expect(response.headers.getSetCookie()).toEqual(cookies);
        expect(response.headers.get("x-source")).toBe("response");
        expect(await response.text()).toBe(method === "HEAD" ? "" : "saved");
      }
    } finally {
      await server.stop(true);
    }
  }
});

test("request-context manifests require an injected bundled scope", () => {
  expect(() =>
    createRequestHandler({
      manifest: {
        version: 1,
        frameworkVersion: "test",
        requestContext: true,
        routes: [],
        assets: [],
        entries: {},
        capabilities: [],
      },
    }),
  ).toThrow("require their bundled requestScope");
});

test("action redirect responses run leaf and root after middleware without loaders or rendering", async () => {
  const order: string[] = [];
  let loads = 0;
  let renders = 0;
  const redirectResponse = new Response(null, {
    status: 303,
    headers: { location: "/done", "set-cookie": "session=updated; Path=/" },
  });
  const handler = createRequestHandler({
    routes: [
      {
        id: "page",
        path: "/",
        file: "page.ts",
        mode: "ssr",
        layouts: ["layout.ts"],
      },
    ],
    modules: {
      "layout.ts": {
        loader: () => {
          loads++;
          return "layout";
        },
        after: [
          async (_ctx, next) => {
            order.push("root");
            const response = await next();
            response.headers.append("set-cookie", "layout=refreshed; Path=/");
            return response;
          },
        ],
      },
      page: {
        loader: () => {
          loads++;
          return "page";
        },
        action: () => redirectResponse,
        after: [
          async (_ctx, next) => {
            order.push("leaf");
            const response = await next();
            expect(response).toBe(redirectResponse);
            response.headers.append("set-cookie", "leaf=refreshed; Path=/");
            return response;
          },
        ],
      },
    },
    renderer: renderer("unused", () => {
      renders++;
      return new Response("wrong");
    }),
  });
  const response = await handler(
    new Request("http://localhost/", { method: "POST" }),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/done");
  expect(response.headers.getSetCookie()).toEqual([
    "session=updated; Path=/",
    "leaf=refreshed; Path=/",
    "layout=refreshed; Path=/",
  ]);
  expect(await response.text()).toBe("");
  expect(order).toEqual(["leaf", "root"]);
  expect(loads).toBe(0);
  expect(renders).toBe(0);
});

test("HEAD initiates discarded stream cancellation and preserves response metadata", async () => {
  let cancelled = false;
  const handler = createRequestHandler({
    routes: [{ id: "stream", path: "/", file: "stream.ts", mode: "api" }],
    modules: {
      stream: {
        loader: () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
                return new Promise(() => {});
              },
            }),
            {
              status: 202,
              headers: {
                "x-stream": "yes",
                "content-length": "17",
                "set-cookie": "session=active; Path=/",
              },
            },
          ),
      },
    },
  });
  const response = await handler(
    new Request("http://localhost/", { method: "HEAD" }),
  );
  expect(cancelled).toBe(true);
  expect(response.status).toBe(202);
  expect(response.body).toBeNull();
  expect(response.headers.get("x-stream")).toBe("yes");
  expect(response.headers.get("content-length")).toBe("17");
  expect(response.headers.getSetCookie()).toEqual(["session=active; Path=/"]);
});

test("HEAD ignores rejected cancellation without losing its valid response", async () => {
  let attempts = 0;
  const handler = createRequestHandler({
    routes: [{ id: "stream", path: "/", file: "stream.ts", mode: "api" }],
    modules: {
      stream: {
        loader: () =>
          new Response(
            new ReadableStream({
              async cancel() {
                attempts++;
                await Promise.resolve();
                throw new Error("cleanup failed");
              },
            }),
            { status: 206, headers: { "x-stream": "kept" } },
          ),
      },
    },
  });
  const response = await handler(
    new Request("http://localhost/", { method: "HEAD" }),
  );
  expect(attempts).toBe(1);
  expect(response.status).toBe(206);
  expect(response.body).toBeNull();
  expect(response.headers.get("x-stream")).toBe("kept");
});

test("GET streams remain consumable and are not cancelled by finalization", async () => {
  let cancelled = false;
  const handler = createRequestHandler({
    routes: [{ id: "stream", path: "/", file: "stream.ts", mode: "api" }],
    modules: {
      stream: {
        loader: () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("live data"));
                controller.close();
              },
              cancel() {
                cancelled = true;
              },
            }),
          ),
      },
    },
  });
  const response = await handler(new Request("http://localhost/"));
  expect(await response.text()).toBe("live data");
  expect(cancelled).toBe(false);
});

test("HEAD finalizes a tee branch without waiting for its retained sibling", async () => {
  const [discarded, retained] = new ReadableStream().tee();
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.ts" }],
    modules: { page: { loader: () => new Response(discarded) } },
  });
  const response = await handler(
    new Request("http://localhost/", { method: "HEAD" }),
  );
  expect(response.status).toBe(200);
  expect(response.body).toBeNull();
  await retained.cancel();
});

test("parallel loaders cancel ignored response bodies but retain the selected body", async () => {
  let discarded = 0;
  let selectedCancelled = 0;
  const handler = createRequestHandler({
    routes: [
      { id: "page", path: "/", file: "page.ts", layouts: ["layout.ts"] },
    ],
    modules: {
      "layout.ts": {
        loader: () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode("selected"));
                c.close();
              },
              cancel() {
                selectedCancelled++;
              },
            }),
          ),
      },
      page: {
        loader: () =>
          new Response(
            new ReadableStream({
              cancel() {
                discarded++;
                return Promise.reject(Error("discard failed"));
              },
            }),
          ),
      },
    },
  });
  const response = await handler(new Request("http://localhost/"));
  expect(await response.text()).toBe("selected");
  expect(selectedCancelled).toBe(0);
  expect(discarded).toBe(1);
});

test("synchronous stream cancellation errors are caught and ignored when discarding responses", async () => {
  let discarded = 0;
  let selectedCancelled = 0;
  const handler = createRequestHandler({
    routes: [
      { id: "page", path: "/", file: "page.ts", layouts: ["layout.ts"] },
    ],
    modules: {
      "layout.ts": {
        loader: () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode("selected"));
                c.close();
              },
              cancel() {
                selectedCancelled++;
              },
            }),
          ),
      },
      page: {
        loader: () =>
          new Response(
            new ReadableStream({
              cancel() {
                discarded++;
                throw new Error("sync discard failed");
              },
            }),
          ),
      },
    },
  });
  const response = await handler(new Request("http://localhost/"));
  expect(await response.text()).toBe("selected");
  expect(selectedCancelled).toBe(0);
  expect(discarded).toBe(1);
});

test("after middleware cancels replaced bodies but preserves shared body transfers", async () => {
  let cancelled = 0;
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.ts" }],
    modules: {
      page: {
        loader: () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled++;
              },
            }),
          ),
        after: [
          async () => new Response(null, { status: 204 }),
          async (_ctx, next) => {
            const previous = await next();
            return new Response(previous.body, {
              headers: { "x-transferred": "yes" },
            });
          },
        ],
      },
    },
  });
  const response = await handler(new Request("http://localhost/"));
  expect(await response.text()).toBe("");
  expect(response.headers.get("x-transferred")).toBe("yes");
  expect(cancelled).toBe(1);
});

test("loader rejection stays prompt and cancels resolved and late sibling responses", async () => {
  let earlyCancelled = 0;
  let lateCancelled = 0;
  let finishLate!: (response: Response) => void;
  const handler = createRequestHandler({
    routes: [
      {
        id: "page",
        path: "/",
        file: "page.ts",
        layouts: ["early.ts", "failure.ts"],
      },
    ],
    modules: {
      "early.ts": {
        loader: () =>
          new Response(
            new ReadableStream({
              cancel() {
                earlyCancelled++;
              },
            }),
          ),
      },
      "failure.ts": {
        loader: async () => {
          await Promise.resolve();
          throw Error("loader failed");
        },
      },
      page: {
        loader: () =>
          new Promise<Response>((resolve) => {
            finishLate = resolve;
          }),
      },
    },
  });
  const response = await handler(new Request("http://localhost/"));
  expect(response.status).toBe(500);
  expect(earlyCancelled).toBe(1);
  finishLate(
    new Response(
      new ReadableStream({
        cancel() {
          lateCancelled++;
        },
      }),
    ),
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(lateCancelled).toBe(1);
});

test("before middleware discards replaced or rejected next responses, including late ones", async () => {
  for (const behavior of ["replace", "reject", "late"]) {
    let cancelled = 0;
    let finish!: (response: Response) => void;
    const original = new Response(
      new ReadableStream({
        cancel() {
          cancelled++;
        },
      }),
    );
    const handler = createRequestHandler({
      routes: [{ id: "page", path: "/", file: "page.ts" }],
      modules: {
        page: {
          loader: () =>
            behavior === "late"
              ? new Promise<Response>((resolve) => {
                  finish = resolve;
                })
              : original,
          before: [
            async (_ctx, next) => {
              if (behavior === "late") {
                void next();
                return new Response(null, { status: 204 });
              }
              await next();
              if (behavior === "reject") throw Error("middleware failed");
              return new Response(null, { status: 204 });
            },
          ],
        },
      },
    });
    const response = await handler(new Request("http://localhost/"));
    expect(response.status).toBe(behavior === "reject" ? 500 : 204);
    if (behavior === "late") {
      expect(cancelled).toBe(0);
      finish(original);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(cancelled).toBe(1);
  }
});

test("after errors and aborted loader results discard their response bodies", async () => {
  for (const abort of [false, true]) {
    let cancelled = 0;
    const controller = new AbortController();
    const handler = createRequestHandler({
      routes: [{ id: "page", path: "/", file: "page.ts" }],
      modules: {
        page: {
          loader: () => {
            if (abort) controller.abort();
            return new Response(
              new ReadableStream({
                cancel() {
                  cancelled++;
                },
              }),
            );
          },
          after: [
            async () => {
              throw Error("after failed");
            },
          ],
        },
      },
    });
    expect(
      (
        await handler(
          new Request("http://localhost/", { signal: controller.signal }),
        )
      ).status,
    ).toBe(500);
    expect(cancelled).toBe(1);
  }
});

test("middleware stream transforms retain locked original bodies", async () => {
  for (const phase of ["before", "after"] as const) {
    let cancelled = 0;
    const handler = createRequestHandler({
      routes: [{ id: "page", path: "/", file: "page.ts" }],
      modules: {
        page: {
          loader: () =>
            new Response(
              new ReadableStream({
                start(c) {
                  c.enqueue(new TextEncoder().encode("transferred"));
                  c.close();
                },
                cancel() {
                  cancelled++;
                },
              }),
            ),
          [phase]: [
            async (_ctx: unknown, next: () => Promise<Response>) => {
              const original = await next();
              return new Response(
                original.body!.pipeThrough(new TransformStream()),
              );
            },
          ],
        },
      },
    });
    const response = await handler(new Request("http://localhost/"));
    expect(await response.text()).toBe("transferred");
    expect(cancelled).toBe(0);
  }
});

test("late loader responses sharing a thrown response body remain consumable", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("expected error"));
      controller.close();
    },
  });
  const selected = new Response(body, { status: 409 });
  const sibling = new Response(body);
  let finish!: (response: Response) => void;
  const handler = createRequestHandler({
    routes: [
      { id: "page", path: "/", file: "page.ts", layouts: ["layout.ts"] },
    ],
    modules: {
      "layout.ts": {
        loader: () => {
          throw selected;
        },
      },
      page: {
        loader: () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      },
    },
  });
  const response = await handler(new Request("http://localhost/"));
  finish(sibling);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(response.status).toBe(409);
  expect(await response.text()).toBe("expected error");
});

test("error boundaries discard thrown response bodies only when replaced", async () => {
  for (const behavior of ["replace", "transfer", "throw"]) {
    let cancelled = 0;
    const original = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("original"));
          c.close();
        },
        cancel() {
          cancelled++;
        },
      }),
      { status: 409 },
    );
    const handler = createRequestHandler({
      routes: [{ id: "page", path: "/", file: "page.ts" }],
      modules: {
        page: {
          loader: () => {
            throw original;
          },
          errorBoundary: () => {
            if (behavior === "throw") throw Error("boundary failed");
            return behavior === "transfer"
              ? new Response(original.body, { status: 422 })
              : new Response(null, { status: 422 });
          },
        },
      },
    });
    if (behavior === "throw")
      await expect(handler(new Request("http://localhost/"))).rejects.toThrow(
        "boundary failed",
      );
    else {
      const response = await handler(new Request("http://localhost/"));
      expect(response.status).toBe(422);
      expect(await response.text()).toBe(
        behavior === "transfer" ? "original" : "",
      );
    }
    expect(cancelled).toBe(behavior === "transfer" ? 0 : 1);
  }
});

test("middleware replacement streams may defer consuming their previous response", async () => {
  for (const phase of ["before", "after"] as const) {
    let cancelled = 0;
    const handler = createRequestHandler({
      routes: [{ id: "page", path: "/", file: "page.ts" }],
      modules: {
        page: {
          loader: async () => {
            await new Promise((resolve) => setTimeout(resolve, 2));
            return new Response(
              new ReadableStream({
                start(c) {
                  c.enqueue(new TextEncoder().encode("deferred"));
                  c.close();
                },
                cancel() {
                  cancelled++;
                },
              }),
            );
          },
          [phase]: [
            async (_ctx: unknown, next: () => Promise<Response>) =>
              new Response(
                new ReadableStream({
                  async start(controller) {
                    await new Promise((resolve) => setTimeout(resolve, 2));
                    const previous = await next();
                    const reader = previous.body!.getReader();
                    try {
                      while (true) {
                        const chunk = await reader.read();
                        if (chunk.done) break;
                        controller.enqueue(chunk.value);
                      }
                      controller.close();
                    } catch (error) {
                      controller.error(error);
                    } finally {
                      reader.releaseLock();
                    }
                  },
                }),
              ),
          ],
        },
      },
    });
    const response = await handler(new Request("http://localhost/"));
    expect(await response.text()).toBe("deferred");
    expect(cancelled).toBe(0);
  }
});

test("detached next rejection discards its Response after a bodyless middleware result", async () => {
  let cancelled = 0;
  let rejectNext!: (response: Response) => void;
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.ts" }],
    modules: {
      page: {
        loader: () =>
          new Promise<Response>((_resolve, reject) => {
            rejectNext = reject;
          }),
        before: [
          async (_ctx, next) => {
            void next();
            return new Response(null, { status: 204 });
          },
        ],
      },
    },
  });
  expect((await handler(new Request("http://localhost/"))).status).toBe(204);
  rejectNext(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled++;
        },
      }),
      { status: 409 },
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(cancelled).toBe(1);
});
