import { describe, expect, test } from "bun:test";
import {
  createMoonshineServer,
  definePage,
  handleMoonshineRequest,
} from "@tschk/moonshine/server";

describe("bun-server example contract", () => {
  const pages = {
    "/": definePage({ render: () => "<h1>home</h1>" }),
    "/api/hello": definePage({
      render: () => ({ ok: true }),
    }),
    "/blog/*": definePage({
      render: (req) => `blog:${req.pathname}`,
    }),
  };

  test("home is html", async () => {
    const res = await handleMoonshineRequest(new Request("http://x/"), { pages });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("home");
  });

  test("api is json", async () => {
    const res = await handleMoonshineRequest(new Request("http://x/api/hello"), {
      pages,
    });
    expect(await res.json()).toEqual({ ok: true });
  });

  test("splat matches blog paths", async () => {
    const res = await handleMoonshineRequest(new Request("http://x/blog/a"), {
      pages,
    });
    expect(await res.text()).toBe("blog:/blog/a");
  });

  test("listen requires Bun and returns a server", () => {
    const server = createMoonshineServer({
      port: 0,
      pages: { "/": definePage({ render: () => "ok" }) },
    });
    const handle = server.listen() as { stop?: () => void; port: number };
    expect(typeof handle.port).toBe("number");
    handle.stop?.();
  });
});
