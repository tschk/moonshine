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
    expect(await res.json()).toEqual({ error: "aborted" });
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

  test("production error response omits stack", async () => {
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
    expect(body.error).toBe("secret");
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

    const blocked = await handler(new Request("http://x/../etc/passwd"));
    expect(blocked.status).toBe(404);
  });

  test("unmatched route returns 404", async () => {
    const routes = graph([{ id: "home", path: "/", file: "home.tsx" }]);
    const handler = createRequestHandler({ graph: routes, modules: {} });
    const res = await handler(new Request("http://x/missing"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });
});
