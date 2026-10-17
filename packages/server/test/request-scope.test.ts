import { expect, test } from "bun:test";
import { getRequest, runWithRequest } from "@tschk/moonshine-framework/request";
import { createRequestHandler } from "../src";

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

test("request scope covers concurrent asynchronous pipeline stages and restores outside context", async () => {
  const seen: string[] = [];
  let scoped = 0;
  const check = async (request: Request, stage: string) => {
    expect(getRequest()).toBe(request);
    await pause();
    expect(getRequest()).toBe(request);
    seen.push(`${request.headers.get("x-request")}:${stage}`);
  };
  const handler = createRequestHandler({
    requestScope: (request, fn) => {
      scoped++;
      return runWithRequest(request, fn);
    },
    routes: [
      { id: "page", path: "/", file: "page.ts", mode: "ssr" },
      { id: "error", path: "/error", file: "error.ts", mode: "ssr" },
    ],
    modules: {
      page: {
        before: [
          async (ctx, next) => {
            await check(ctx.request, "before");
            const response = await next();
            await check(ctx.request, "before-return");
            return response;
          },
        ],
        loader: async (ctx) => {
          await check(ctx.request, "loader");
          return "loaded";
        },
        action: async (ctx) => {
          await check(ctx.request, "action");
          return "acted";
        },
        after: [
          async (ctx, next) => {
            await check(ctx.request, "after");
            return next();
          },
        ],
      },
      error: {
        loader: async (ctx) => {
          await check(ctx.request, "throwing-loader");
          throw new Error("expected");
        },
        errorBoundary: async (ctx) => {
          await check(ctx.request, "boundary");
          return new Response("boundary");
        },
      },
    },
    renderer: {
      name: "test",
      render: async (ctx) => {
        await check(ctx.request, "render");
        return new Response("rendered");
      },
      prerender: async () => "",
    },
    notFound: async (ctx) => {
      await check(ctx.request, "not-found");
      return new Response("missing", { status: 404 });
    },
  });
  expect(getRequest()).toBeUndefined();
  const requests = [
    new Request("http://localhost/", { headers: { "x-request": "read" } }),
    new Request("http://localhost/", {
      method: "POST",
      headers: { "x-request": "write" },
    }),
    new Request("http://localhost/error", {
      headers: { "x-request": "error" },
    }),
    new Request("http://localhost/missing", {
      headers: { "x-request": "missing" },
    }),
  ];
  const responses = await Promise.all(
    requests.map((request) => handler(request)),
  );
  expect(
    await Promise.all(responses.map((response) => response.text())),
  ).toEqual(["rendered", "rendered", "boundary", "missing"]);
  for (const stage of ["before", "loader", "after", "render", "before-return"])
    expect(seen).toContain(`read:${stage}`);
  expect(seen).toContain("write:action");
  expect(seen).toContain("write:loader");
  expect(seen).toContain("write:render");
  expect(seen).toContain("error:boundary");
  expect(seen).toContain("missing:not-found");
  expect(getRequest()).toBeUndefined();
  expect(scoped).toBe(4);
});

test("omitting the scope hook leaves request context unset", async () => {
  const handler = createRequestHandler({
    routes: [],
    notFound: async () => {
      expect(getRequest()).toBeUndefined();
      await pause();
      expect(getRequest()).toBeUndefined();
      return new Response("missing");
    },
  });
  expect(await (await handler(new Request("http://localhost/"))).text()).toBe(
    "missing",
  );
});
