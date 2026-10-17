import { expect, test } from "bun:test";
import {
  getResponseHeaders,
  runWithRequest,
} from "@tschk/moonshine-framework/request";
import { createRequestHandler, redirect } from "../src";

const make = (wait: (id: string) => Promise<void> = async () => {}) =>
  createRequestHandler({
    requestScope: runWithRequest,
    routes: [
      { id: "page", path: "/", file: "page.ts", mode: "ssr" },
      { id: "redir", path: "/redir", file: "redir.ts", mode: "ssr" },
      { id: "boundary", path: "/boundary", file: "boundary.ts", mode: "ssr" },
      { id: "boom", path: "/boom", file: "boom.ts", mode: "ssr" },
      { id: "override", path: "/override", file: "override.ts", mode: "ssr" },
    ],
    modules: {
      page: {
        before: [
          async (ctx, next) => {
            const id = ctx.request.headers.get("x-id") ?? "";
            getResponseHeaders()?.set("x-id", id);
            await wait(id);
            getResponseHeaders()?.append("set-cookie", `c=${id}`);
            return next();
          },
        ],
        loader: async () => "ok",
      },
      redir: {
        loader: async () => {
          getResponseHeaders()?.set("x-scope", "yes");
          redirect("/elsewhere", 303);
        },
      },
      boundary: {
        loader: async () => {
          getResponseHeaders()?.set("x-scope", "yes");
          getResponseHeaders()?.append("set-cookie", "s=1");
          throw new Error("expected");
        },
        errorBoundary: async () => {
          const headers = new Headers({ "x-own": "1" });
          headers.append("set-cookie", "r=1");
          return new Response("boundary", { status: 500, headers });
        },
      },
      boom: {
        loader: async () => {
          getResponseHeaders()?.set("x-scope", "yes");
          throw new Error("unhandled");
        },
      },
      override: {
        loader: async () => {
          const headers = getResponseHeaders();
          headers?.set("x-over", "scope");
          headers?.set("x-keep", "scope");
          headers?.append("set-cookie", "s=1");
          throw new Response("o", {
            headers: [
              ["x-over", "response"],
              ["set-cookie", "r=1"],
            ],
          });
        },
      },
    },
    renderer: {
      name: "test",
      render: async () => new Response("rendered"),
      prerender: async () => "",
    },
    notFound: async () => {
      getResponseHeaders()?.set("x-scope", "yes");
      return new Response("missing", { status: 404 });
    },
  });

test("overlapping requests keep isolated response headers", async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  const handler = make((id) => {
    if (id === "a") return promise;
    resolve();
    return Promise.resolve();
  });
  const [a, b] = await Promise.all(
    ["a", "b"].map((id) =>
      handler(new Request("http://localhost/", { headers: { "x-id": id } })),
    ),
  );
  expect(a.headers.get("x-id")).toBe("a");
  expect(a.headers.getSetCookie()).toEqual(["c=a"]);
  expect(b.headers.get("x-id")).toBe("b");
  expect(b.headers.getSetCookie()).toEqual(["c=b"]);
});

test("response headers override scope headers and cookies append scope first", async () => {
  const res = await make()(new Request("http://localhost/override"));
  expect(res.headers.get("x-over")).toBe("response");
  expect(res.headers.get("x-keep")).toBe("scope");
  expect(res.headers.getSetCookie()).toEqual(["s=1", "r=1"]);
});

test("error boundary response retains scope headers and both cookies", async () => {
  const res = await make()(new Request("http://localhost/boundary"));
  expect(res.status).toBe(500);
  expect(res.headers.get("x-scope")).toBe("yes");
  expect(res.headers.get("x-own")).toBe("1");
  expect(res.headers.getSetCookie()).toEqual(["s=1", "r=1"]);
});

test("redirect, unhandled error and 404 preserve scope headers", async () => {
  const handler = make();
  const redirected = await handler(new Request("http://localhost/redir"));
  expect(redirected.status).toBe(303);
  expect(redirected.headers.get("location")).toBe("/elsewhere");
  expect(redirected.headers.get("x-scope")).toBe("yes");
  const boom = await handler(new Request("http://localhost/boom"));
  expect(boom.status).toBe(500);
  expect(boom.headers.get("x-scope")).toBe("yes");
  const missing = await handler(new Request("http://localhost/nope"));
  expect(missing.status).toBe(404);
  expect(missing.headers.get("x-scope")).toBe("yes");
});

test("HEAD paths preserve scope headers", async () => {
  const handler = make();
  for (const path of ["/", "/boom", "/nope", "/redir"]) {
    const res = await handler(
      new Request(`http://localhost${path}`, {
        method: "HEAD",
        headers: { "x-id": "h" },
      }),
    );
    expect(res.headers.get(path === "/" ? "x-id" : "x-scope")).toBe(
      path === "/" ? "h" : "yes",
    );
    expect(await res.text()).toBe("");
  }
});

test("scope hook without headers argument leaves responses unchanged", async () => {
  const handler = createRequestHandler({
    requestScope: (request, fn) => runWithRequest(request, fn),
    routes: [],
  });
  const res = await handler(new Request("http://localhost/x"));
  expect(res.status).toBe(404);
  expect(res.headers.get("x-scope")).toBeNull();
});
