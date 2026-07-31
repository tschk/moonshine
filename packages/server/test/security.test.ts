import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  createRequestHandler,
  errorResponse,
  redirect,
  resolveStaticPath,
} from "../src";
import { tryServeStatic } from "../src/static";
import type { RouteModule } from "../src/data";

const tmpDir = mkdtempSync(resolve(tmpdir(), "ms-sec-"));
const staticDir = resolve(tmpDir, "public");

beforeAll(() => {
  mkdirSync(staticDir, { recursive: true });
  writeFileSync(resolve(staticDir, "ok.txt"), "ok");
  writeFileSync(resolve(tmpDir, "secret.txt"), "secret");
  writeFileSync(resolve(staticDir, ".env"), "TOKEN=redacted");
  mkdirSync(resolve(staticDir, ".well-known"), { recursive: true });
  writeFileSync(resolve(staticDir, ".well-known", "probe.txt"), "probe");
  symlinkSync(resolve(tmpDir, "secret.txt"), resolve(staticDir, "escape.txt"));
  mkdirSync(resolve(tmpDir, "real-root"), { recursive: true });
  writeFileSync(resolve(tmpDir, "real-root", "ok.txt"), "ok");
  symlinkSync(resolve(tmpDir, "real-root"), resolve(tmpDir, "linked-root"));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveStaticPath", () => {
  test("blocks literal and encoded traversal", () => {
    expect(resolveStaticPath(staticDir, "/../../secret.txt")).toBeNull();
    expect(resolveStaticPath(staticDir, "/%2e%2e/secret.txt")).toBeNull();
    expect(resolveStaticPath(staticDir, "/foo/%2e%2e%2fsecret.txt")).toBeNull();
    expect(resolveStaticPath(staticDir, "/..%2fsecret.txt")).toBeNull();
    expect(resolveStaticPath(staticDir, "/%2f..%2f")).toBeNull();
  });

  test("rejects malformed percent, null byte, and separators", () => {
    expect(resolveStaticPath(staticDir, "/%")).toBeNull();
    expect(resolveStaticPath(staticDir, "/%ZZ")).toBeNull();
    expect(resolveStaticPath(staticDir, "/ok%00.txt")).toBeNull();
    expect(resolveStaticPath(staticDir, "/ok%2fother.txt")).toBeNull();
  });

  test("serves normal files", () => {
    expect(resolveStaticPath(staticDir, "/ok.txt")).toBe(
      resolve(staticDir, "ok.txt"),
    );
  });

  test("rejects dotfile segments but allows .well-known", () => {
    expect(resolveStaticPath(staticDir, "/.env")).toBeNull();
    expect(resolveStaticPath(staticDir, "/.git/config")).toBeNull();
    expect(resolveStaticPath(staticDir, "/%2Eenv")).toBeNull();
    expect(resolveStaticPath(staticDir, "/.well-known/probe.txt")).toBe(
      resolve(staticDir, ".well-known", "probe.txt"),
    );
  });
});

describe("errorResponse", () => {
  const secret = "connect ECONNREFUSED /var/run/db.sock user=root";

  test("does not leak the thrown message outside development", async () => {
    for (const mode of ["production", undefined] as const) {
      const res = errorResponse(new Error(secret), mode);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain("db.sock");
      expect(text).not.toContain("root");
      expect(JSON.parse(text)).toEqual({ error: "Internal Server Error" });
    }
  });

  test("keeps message and stack in development", async () => {
    const res = errorResponse(new Error(secret), "development");
    const body = (await res.json()) as { error: string; stack?: string };
    expect(body.error).toBe(secret);
    expect(body.stack).toBeTruthy();
  });

  test("does not leak non-Error thrown values", async () => {
    const res = errorResponse(secret, "production");
    expect(await res.text()).not.toContain("db.sock");
  });
});

describe("tryServeStatic", () => {
  test("refuses to follow a symlink that escapes the root", async () => {
    expect(await tryServeStatic(staticDir, "/escape.txt")).toBeNull();
  });

  test("serves through a symlinked root directory", async () => {
    const res = await tryServeStatic(resolve(tmpDir, "linked-root"), "/ok.txt");
    expect(res).not.toBeNull();
    expect(await res!.text()).toBe("ok");
  });

  test("sets nosniff on static responses", async () => {
    const res = await tryServeStatic(staticDir, "/ok.txt");
    expect(res!.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("does not serve dotfiles", async () => {
    expect(await tryServeStatic(staticDir, "/.env")).toBeNull();
  });
});

describe("createRequestHandler security", () => {
  const staticHandler = createRequestHandler({
    staticDir,
    routes: [],
    notFound: () => new Response("Not Found", { status: 404 }),
  });

  test("does not serve files outside staticDir", async () => {
    const r1 = await staticHandler(new Request("http://x/%2e%2e%2fsecret.txt"));
    expect(r1.status).toBe(404);
    const r2 = await staticHandler(new Request("http://x/ok.txt"));
    expect(r2.status).toBe(200);
    const r3 = await staticHandler(new Request("http://x/%"));
    expect(r3.status).toBe(404);
  });

  const routes = [
    { id: "home", path: "/", file: "home.tsx" },
    { id: "redirect", path: "/redirect", file: "redirect.tsx" },
    { id: "open", path: "/open", file: "open.tsx" },
    { id: "crlf", path: "/crlf", file: "crlf.tsx" },
    { id: "hello", path: "/hello/:name", file: "hello.tsx" },
  ];

  const modules: Record<string, RouteModule> = {
    home: { loader: () => ({}) },
    redirect: {
      loader: () => {
        throw redirect("/home");
      },
    },
    open: {
      loader: () => {
        throw redirect("//evil.com");
      },
    },
    crlf: {
      loader: () => {
        throw redirect("http://evil.com\r\nX-Injected: 1");
      },
    },
    hello: { loader: (ctx) => ({ name: ctx.params.name }) },
  };

  const handler = createRequestHandler({
    routes,
    modules,
    notFound: () => new Response("Not Found", { status: 404 }),
  });

  test("allows same-origin relative redirects", async () => {
    const res = await handler(new Request("http://localhost/redirect"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/home");
  });

  test("rejects open redirects to other origins", async () => {
    const res = await handler(new Request("http://localhost/open"));
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });

  test("rejects header injection in redirect location", async () => {
    const res = await handler(new Request("http://localhost/crlf"));
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-injected")).toBeNull();
  });

  test("rejects same-origin path with embedded CR/LF", async () => {
    const modulesWithCr: Record<string, RouteModule> = {
      ...modules,
      crlf: {
        loader: () => {
          throw redirect("/home\r\nX-Injected: 1");
        },
      },
    };
    const h = createRequestHandler({
      routes,
      modules: modulesWithCr,
      notFound: () => new Response("Not Found", { status: 404 }),
    });
    const res = await h(new Request("http://localhost/crlf"));
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });

  test("isolates request context across concurrent requests", async () => {
    const [r1, r2] = await Promise.all([
      handler(new Request("http://localhost/hello/alice")),
      handler(new Request("http://localhost/hello/bob")),
    ]);
    const d1 = (await r1.json()) as Record<string, { name: string }>;
    const d2 = (await r2.json()) as Record<string, { name: string }>;
    expect(d1.hello.name).toBe("alice");
    expect(d2.hello.name).toBe("bob");
  });
});
