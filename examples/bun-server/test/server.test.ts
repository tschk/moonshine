import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMoonshineServer,
  definePage,
  handleMoonshineRequest,
  resolveStaticPath,
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

  test("staticDir serves assets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ms-ex-"));
    writeFileSync(join(dir, "app.css"), "body{}");
    const res = await handleMoonshineRequest(new Request("http://x/app.css"), {
      pages: {},
      staticDir: dir,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("body{}");
  });

  test("resolveStaticPath blocks escape", () => {
    expect(resolveStaticPath("/var/www", "/../secret")).toBeNull();
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

describe("client build", () => {
  test("build:client emits public/client.js", async () => {
    mkdirSync(join(import.meta.dir, "../public"), { recursive: true });
    const proc = Bun.spawn(
      [
        "bun",
        "build",
        "./src/client.tsx",
        "--outdir=public",
        "--target=browser",
        "--format=esm",
      ],
      {
        cwd: join(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const code = await proc.exited;
    expect(code).toBe(0);
    const file = Bun.file(join(import.meta.dir, "../public/client.js"));
    expect(await file.exists()).toBe(true);
    const text = await file.text();
    expect(text.length).toBeGreaterThan(100);
  });
});
