import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RenderContext, RouteArtifact } from "@tschk/moonshine-framework";
import { solidRenderer } from "../src/index";

const fixtures = join(import.meta.dir, "fixtures");

function makeRoute(
  overrides: Partial<RouteArtifact> & { mode: RouteArtifact["mode"] },
): RouteArtifact {
  return {
    id: "home",
    path: "/",
    file: join(fixtures, "Home.ts"),
    runtime: "bun",
    decision: "test",
    clientEntries: [],
    ...overrides,
  };
}

function makeContext(
  route: RouteArtifact,
  overrides?: Partial<RenderContext>,
): RenderContext {
  return {
    request: new Request(`http://localhost${route.path}`),
    route,
    params: {},
    data: { title: "Moonshine" },
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("solid renderer", () => {
  test("prerender static route to string", async () => {
    const html = await solidRenderer.prerender(
      makeContext(makeRoute({ mode: "static" })),
    );
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<h1>");
    expect(html).toContain("Moonshine");
    expect(html).toContain('data-moonshine-mode="static"');
  });

  test("render static route returns HTML response", async () => {
    const res = await solidRenderer.render(
      makeContext(makeRoute({ mode: "static" })),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("Moonshine");
    expect(text).toContain("<!DOCTYPE html>");
  });

  test("render ssr route returns a streaming HTML response", async () => {
    const res = await solidRenderer.render(
      makeContext(
        makeRoute({
          mode: "ssr",
          file: join(fixtures, "About.ts"),
          path: "/about",
        }),
        { params: { name: "stream" }, data: {} },
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.body).toBeInstanceOf(ReadableStream);
    const text = await res.text();
    expect(text).toMatch(/Hello[\s\S]*stream/);
  });

  test("render ssr route with layouts wraps the page", async () => {
    const res = await solidRenderer.render(
      makeContext(
        makeRoute({
          mode: "ssr",
          layouts: [join(fixtures, "Layout.ts")],
        }),
      ),
    );
    const text = await res.text();
    expect(text).toContain("<main>");
    expect(text).toContain("</main>");
    expect(text).toContain("Moonshine");
  });

  test("render spa route returns a shell with client script", async () => {
    const res = await solidRenderer.render(
      makeContext(makeRoute({ mode: "spa", clientEntries: ["/client.js"] })),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
    expect(text).toContain("/client.js");
    expect(text).toContain("<script");
    expect(text).toContain("moonshine-app");
  });

  test("render api route does not invoke Solid renderer", async () => {
    const res = await solidRenderer.render(
      makeContext(makeRoute({ mode: "api", file: "nonexistent.ts" })),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ title: "Moonshine" });
  });

  test("framework implementation imports solid-js/web, not React or Crepus", () => {
    const src = readFileSync(
      join(import.meta.dir, "../src/framework.ts"),
      "utf8",
    );
    expect(src).toContain("solid-js/web");
    expect(src).not.toContain('from "react"');
    expect(src).not.toContain("crepus-moonshine");
  });
});
