import { expect, test } from "bun:test";
import { data } from "../../adapter-react-router/src/responses";
import { createRequestHandler } from "../src";

for (const method of ["GET", "POST"]) {
  test(`${method} route data retains payload identity, status and headers`, async () => {
    const payload = { message: "invalid" };
    let rendered: unknown;
    const result = () =>
      data(payload, { status: 422, headers: { "x-validation": "failed" } });
    const handler = createRequestHandler({
      routes: [{ id: "page", path: "/", file: "page.tsx" }],
      modules: {
        page: method === "GET" ? { loader: result } : { action: result },
      },
      renderer: {
        name: "test",
        render: async (ctx) => {
          rendered = (ctx.data as Record<string, unknown>).page;
          return new Response("validation page");
        },
        prerender: async () => "",
      },
    });
    const response = await handler(
      new Request("http://localhost/", { method }),
    );
    expect(rendered).toBe(payload);
    expect(response.status).toBe(422);
    expect(response.headers.get("x-validation")).toBe("failed");
    expect(await response.text()).toBe("validation page");
  });
}

test("action metadata wins over ordered layout/page data without duplicating cookies", async () => {
  const seen: unknown[] = [];
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.tsx", layouts: ["layout"] }],
    modules: {
      layout: {
        loader: () =>
          data("layout", {
            status: 202,
            headers: { "x-order": "layout", "set-cookie": "layout=1" },
          }),
      },
      page: {
        action: () =>
          data("action", {
            status: 422,
            headers: { "x-order": "action", "set-cookie": "action=1" },
          }),
        loader: () =>
          data("page", {
            status: 201,
            headers: { "x-order": "page", "set-cookie": "page=1" },
          }),
        after: [
          async (_ctx, next) => {
            const response = await next();
            seen.push(response.status, response.headers.get("x-order"));
            return response;
          },
        ],
      },
    },
    renderer: {
      name: "test",
      render: async (ctx) => {
        expect(ctx.data).toEqual({
          layout: "layout",
          page: "page",
          __action: "action",
        });
        return new Response("page", { headers: { "set-cookie": "render=1" } });
      },
      prerender: async () => "",
    },
  });
  const response = await handler(
    new Request("http://localhost/", { method: "POST" }),
  );
  expect(response.status).toBe(422);
  expect(response.headers.getSetCookie()).toEqual([
    "render=1",
    "layout=1",
    "page=1",
    "action=1",
  ]);
  expect(seen).toEqual([422, "action"]);
});

for (const status of [204, 205, 304]) {
  test(`data status ${status} discards the rendered body`, async () => {
    let cancelled = false;
    const handler = createRequestHandler({
      routes: [{ id: "page", path: "/", file: "page.tsx" }],
      modules: { page: { loader: () => data(null, status) } },
      renderer: {
        name: "test",
        render: async () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
          ),
        prerender: async () => "",
      },
    });
    const response = await handler(new Request("http://localhost/"));
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    expect(cancelled).toBe(true);
  });
}

test("ordinary payloads remain intact and wrapped Response values remain data", async () => {
  const ordinary = { type: "DataWithResponseInit", message: "ordinary" };
  const payload = new Response("payload");
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.tsx", layouts: ["layout"] }],
    modules: {
      layout: { loader: () => ordinary },
      page: { action: () => data(payload, 202) },
    },
    renderer: {
      name: "test",
      render: async (ctx) => {
        const values = ctx.data as Record<string, unknown>;
        expect(values.layout).toBe(ordinary);
        expect(values.page).toBe(payload);
        return new Response("rendered");
      },
      prerender: async () => "",
    },
  });
  const response = await handler(
    new Request("http://localhost/", { method: "POST" }),
  );
  expect(response.status).toBe(202);
  expect(await response.text()).toBe("rendered");
  expect(payload.bodyUsed).toBe(false);
});

test("returned Responses retain precedence over data metadata", async () => {
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.tsx", layouts: ["layout"] }],
    modules: {
      layout: {
        loader: () =>
          data("layout", { status: 422, headers: { "x-data": "ignored" } }),
      },
      page: { loader: () => new Response("direct", { status: 201 }) },
    },
  });
  const response = await handler(new Request("http://localhost/"));
  expect(response.status).toBe(201);
  expect(response.headers.has("x-data")).toBe(false);
  expect(await response.text()).toBe("direct");
});

test("invalid data metadata cancels resolved loader response bodies before rendering", async () => {
  let cancelled = false;
  let rendered = false;
  const handler = createRequestHandler({
    routes: [{ id: "page", path: "/", file: "page.tsx", layouts: ["layout"] }],
    modules: {
      layout: {
        loader: () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
          ),
      },
      page: { loader: () => data("invalid", 99) },
    },
    renderer: {
      name: "test",
      render: async () => {
        rendered = true;
        return new Response("unexpected");
      },
      prerender: async () => "",
    },
  });
  const response = await handler(new Request("http://localhost/"));
  expect(response.status).toBe(500);
  expect(cancelled).toBe(true);
  expect(rendered).toBe(false);
});
