import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverRoutes, segmentToPattern } from "../src/discover.js";

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

describe("segmentToPattern", () => {
  test("returns static segment unchanged", () => {
    expect(segmentToPattern("about")).toBe("about");
    expect(segmentToPattern("some-page")).toBe("some-page");
  });

  test("converts dynamic segment to param", () => {
    expect(segmentToPattern("[slug]")).toBe(":slug");
    expect(segmentToPattern("[id]")).toBe(":id");
  });

  test("converts optional dynamic segment to optional param", () => {
    expect(segmentToPattern("[[slug]]")).toBe(":slug?");
    expect(segmentToPattern("[[id]]")).toBe(":id?");
  });

  test("converts catch-all segment to wildcard param", () => {
    expect(segmentToPattern("[...slug]")).toBe("*slug");
    expect(segmentToPattern("[...path]")).toBe("*path");
  });
});

test("Waku discovers JSX pages, nested layouts and unprefixed API endpoints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-waku-"));
  try {
    for (const file of [
      "_layout.jsx",
      "index.jsx",
      "blog/_layout.tsx",
      "blog/[slug].jsx",
      "docs/[...path].tsx",
      "_api/contact.ts",
      "_slices/header.tsx",
      "_interceptors/auth.ts",
      "_components/widget.tsx",
      "about.test.tsx",
    ]) {
      const path = join(dir, file);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "");
    }
    const routes = await discoverRoutes({ routesDir: dir, convention: "waku" });
    expect(routes.map((route) => route.path)).toEqual([
      "/",
      "/blog/:slug",
      "/contact",
      "/docs/*path",
    ]);
    expect(
      routes.find((route) => route.path === "/blog/:slug")?.layouts,
    ).toEqual([join(dir, "_layout.jsx"), join(dir, "blog/_layout.tsx")]);
    expect(
      routes.find((route) => route.path === "/contact")?.layouts,
    ).toBeUndefined();
    expect(routes.find((route) => route.path === "/contact")?.mode).toBe("api");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
