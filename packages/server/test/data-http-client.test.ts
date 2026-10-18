import { expect, test } from "bun:test";
import { createRequestHandler } from "../src/data-http";
import { createRouteDataClient } from "../../router/src/data-http";
import { createDataRouter } from "../../router/src/data";

test("real HTTP actions return before independent router revalidation, including bodyless success", async () => {
  let value = 1,
    reads = 0,
    actions = 0,
    renders = 0,
    failLoad = false;
  const handler = createRequestHandler({
    dataRequests: true,
    routes: [{ id: "page", path: "/", file: "page.ts", mode: "ssr" }],
    modules: {
      page: {
        loader() {
          reads++;
          if (failLoad) {
            failLoad = false;
            throw Error("reload failed");
          }
          return { value };
        },
        async action({ request }) {
          actions++;
          const body = await request.text();
          if (body === "void")
            return {
              type: "DataWithResponseInit",
              data: null,
              init: { status: 204 },
            };
          value = Number(body);
          return { saved: value };
        },
      },
    },
    renderer: {
      name: "test",
      prerender: async () => "",
      render: async () => {
        renders++;
        return new Response("document");
      },
    },
  });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  const client = createRouteDataClient({ origin: server.url.origin });
  const runtime = createDataRouter(client.load, "/", {
    location: "/",
    data: { page: { value: 1 } },
  });
  try {
    expect(
      await runtime.submit((ctx) =>
        client.action(ctx, { method: "POST", body: "2" }),
      ),
    ).toEqual({ saved: 2 });
    expect(runtime.data.peek().data).toEqual({ page: { value: 2 } });
    expect([reads, actions, renders]).toEqual([1, 1, 0]);
    failLoad = true;
    expect(
      await runtime.submit((ctx) =>
        client.action(ctx, { method: "POST", body: "3" }),
      ),
    ).toEqual({ saved: 3 });
    expect(runtime.data.peek().status).toBe("errored");
    expect(runtime.data.peek().data).toEqual({ page: { value: 2 } });
    expect(runtime.data.peek().error).toBeInstanceOf(Response);
    expect((runtime.data.peek().error as Response).status).toBe(500);
    await runtime.invalidate();
    expect(runtime.data.peek().data).toEqual({ page: { value: 3 } });
    expect(
      await runtime.submit((ctx) =>
        client.action(ctx, { method: "POST", body: "void" }),
      ),
    ).toBeNull();
    expect([reads, actions, renders]).toEqual([4, 3, 0]);
  } finally {
    runtime.dispose();
    await server.stop(true);
  }
});
