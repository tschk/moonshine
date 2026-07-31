import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { reactRenderer } from "../src/renderer";
import type { RenderContext, RouteArtifact } from "@tschk/moonshine-framework";

const fixtures = join(import.meta.dir, "fixtures");

function makeRoute(
  overrides: Partial<RouteArtifact> & { mode: RouteArtifact["mode"] },
): RouteArtifact {
  return {
    id: "home",
    path: "/",
    file: join(fixtures, "Home.tsx"),
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

describe("react renderer", () => {
  test("prerender static route to string", async () => {
    const html = await reactRenderer.prerender(
      makeContext(makeRoute({ mode: "static" })),
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Moonshine");
    expect(html).toContain("<!DOCTYPE html>");
  });

  test("render static route returns HTML response", async () => {
    const res = await reactRenderer.render(
      makeContext(makeRoute({ mode: "static" })),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("Moonshine");
    expect(text).toContain("<!DOCTYPE html>");
  });

  test("render ssr route returns a streaming HTML response", async () => {
    const res = await reactRenderer.render(
      makeContext(
        makeRoute({
          mode: "ssr",
          file: join(fixtures, "About.tsx"),
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

  test("render spa route returns a shell with client script", async () => {
    const res = await reactRenderer.render(
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

  test("render api route does not invoke React", async () => {
    const res = await reactRenderer.render(
      makeContext(makeRoute({ mode: "api", file: "nonexistent.tsx" })),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ title: "Moonshine" });
  });
});
