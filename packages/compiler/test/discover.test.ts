import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { discoverRoutes } from "../src/discover";

const fixtureDir = join(import.meta.dir, "fixtures", "routes");

function layoutPath() {
  return join(fixtureDir, "+layout.tsx");
}

function middlewarePath() {
  return join(fixtureDir, "+middleware.ts");
}

function errorPath() {
  return join(fixtureDir, "+error.tsx");
}

describe("discoverRoutes", () => {
  test("discovers exact route IDs and paths", async () => {
    const routes = await discoverRoutes({ routesDir: fixtureDir });
    expect(routes.map((r) => r.id)).toEqual([
      "index",
      "about",
      "account/[[tab]]",
      "api/health",
      "blog/[slug]",
      "docs/[...path]",
    ]);
    expect(routes.map((r) => r.path)).toEqual([
      "/",
      "/about",
      "/account/:tab?",
      "/api/health",
      "/blog/:slug",
      "/docs/*path",
    ]);
  });

  test("inherits layout, middleware, and nearest error boundary", async () => {
    const routes = await discoverRoutes({ routesDir: fixtureDir });
    for (const route of routes) {
      expect(route.layouts).toEqual([layoutPath()]);
      expect(route.middleware).toEqual([middlewarePath()]);
      expect(route.errorBoundary).toBe(errorPath());
    }
  });

  test("pairs a route with its data file", async () => {
    const routes = await discoverRoutes({ routesDir: fixtureDir });
    const blog = routes.find((r) => r.id === "blog/[slug]");
    expect(blog).toBeDefined();
    expect(blog!.dataFile).toBe(join(fixtureDir, "blog", "[slug].data.ts"));
  });

  test("marks server files as API mode", async () => {
    const routes = await discoverRoutes({ routesDir: fixtureDir });
    const api = routes.find((r) => r.id === "api/health");
    expect(api).toBeDefined();
    expect(api!.mode).toBe("api");
  });

  test("produces deterministic sorted output", async () => {
    const first = await discoverRoutes({ routesDir: fixtureDir });
    const second = await discoverRoutes({ routesDir: fixtureDir });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.map((r) => r.path)).toEqual([
      "/",
      "/about",
      "/account/:tab?",
      "/api/health",
      "/blog/:slug",
      "/docs/*path",
    ]);
  });
});
