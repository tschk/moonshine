import { expect, test } from "bun:test";
import { createRequestHandler } from "../src";

for (const id of ["constructor", "toString", "__proto__"]) {
  test(`module lookup uses file fallback for unregistered ${id}`, async () => {
    const handler = createRequestHandler({
      routes: [{ id, path: "/", file: "page.ts", mode: "api" }],
      modules: { "page.ts": { loader: () => ({ found: true }) } },
    });
    const response = await handler(new Request("http://localhost/"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ "page.ts": { found: true } });
  });

  test(`explicit ${id} registrations preserve loader and action data`, async () => {
    const handler = createRequestHandler({
      routes: [{ id, path: "/", file: "page.ts", mode: "api" }],
      modules: Object.fromEntries([[id, { loader: () => "loaded" }]]),
    });
    const response = await handler(new Request("http://localhost/"));
    expect(await response.json()).toEqual(Object.fromEntries([[id, "loaded"]]));
    const actionHandler = createRequestHandler({
      routes: [{ id, path: "/", file: "page.ts", mode: "api" }],
      modules: Object.fromEntries([[id, { action: () => ({ saved: true }) }]]),
    });
    const actionResponse = await actionHandler(
      new Request("http://localhost/", { method: "POST" }),
    );
    expect(await actionResponse.json()).toEqual(
      Object.fromEntries([[id, { saved: true }]]),
    );
  });
}

test("inherited layout, middleware and error boundary modules are not registrations", async () => {
  let inheritedCalls = 0;
  let fail = false;
  const modules = Object.assign(
    Object.create({
      layout: {
        loader: () => {
          inheritedCalls++;
        },
      },
      middleware: {
        before: [
          (_ctx: unknown, next: () => Promise<Response>) => {
            inheritedCalls++;
            return next();
          },
        ],
      },
      boundary: {
        errorBoundary: () => {
          inheritedCalls++;
          return new Response("inherited", { status: 418 });
        },
      },
    }),
    {
      "page.ts": {
        loader: () => {
          if (fail) throw new Error("page failure");
          return "loaded";
        },
      },
    },
  );
  const handler = createRequestHandler({
    routes: [
      {
        id: "page",
        path: "/",
        file: "page.ts",
        mode: "api",
        layouts: ["layout"],
        middleware: ["middleware"],
        errorBoundary: "boundary",
      },
    ],
    modules,
  });
  expect((await handler(new Request("http://localhost/"))).status).toBe(200);
  fail = true;
  expect((await handler(new Request("http://localhost/"))).status).toBe(500);
  expect(inheritedCalls).toBe(0);
});
