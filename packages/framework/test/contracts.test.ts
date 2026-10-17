import { expect, test } from "bun:test";
import {
  defineConfig,
  defineRoute,
  MANIFEST_VERSION,
  validateRuntime,
  type DeploymentAdapter,
  type MoonshineManifest,
} from "../src";

test("contracts preserve exact input and version one", () => {
  const route = defineRoute({
    id: "home",
    path: "/",
    file: "src/routes/index.tsx",
  });
  expect(route.path).toBe("/");
  expect(defineConfig({ mode: "auto" }).mode).toBe("auto");
  expect(MANIFEST_VERSION).toBe(1);
});

test("native artifacts refuse deployment adapters without native runtime wiring", () => {
  const manifest: MoonshineManifest = {
    version: 1,
    frameworkVersion: "test",
    renderer: "native",
    routes: [],
    assets: [],
    entries: {},
    capabilities: [],
  };
  for (const name of ["unsupported"]) {
    const adapter: DeploymentAdapter = {
      name,
      runtimes: [],
      capabilities: [],
      build: async () => {},
    };
    expect(() => validateRuntime(adapter, manifest)).toThrow(
      "requires matching Bun, Node or Cloudflare runtimes",
    );
  }
});

test("native deployment requires matching supported route runtimes", () => {
  for (const name of ["bun", "node", "cloudflare", "vercel"] as const) {
    const adapter: DeploymentAdapter = {
      name,
      runtimes: ["bun", "node", "cloudflare"],
      capabilities: [],
      build: async () => {},
    };
    const manifest: MoonshineManifest = {
      version: 1,
      frameworkVersion: "test",
      renderer: "native",
      routes: [
        {
          id: "home",
          path: "/",
          file: "page.ts",
          mode: "ssr",
          decision: "test",
          clientEntries: [],
          runtime: name === "vercel" ? "node" : name,
        },
      ],
      assets: [],
      entries: {},
      capabilities: [],
    };
    expect(() => validateRuntime(adapter, manifest)).not.toThrow();
    manifest.routes[0]!.runtime = name === "bun" ? "node" : "bun";
    expect(() => validateRuntime(adapter, manifest)).toThrow(
      "matching Bun, Node or Cloudflare runtimes",
    );
  }
});

test("request context requires matching Bun or Node adapters and runtimes", () => {
  for (const name of ["bun", "node", "cloudflare", "vercel"] as const) {
    const adapter: DeploymentAdapter = {
      name,
      runtimes: ["bun", "node", "cloudflare", "vercel-edge"],
      capabilities: [],
      build: async () => {},
    };
    const manifest: MoonshineManifest = {
      version: 1,
      frameworkVersion: "test",
      requestContext: true,
      routes: [],
      assets: [],
      entries: {},
      capabilities: [],
    };
    if (name === "bun" || name === "node") {
      expect(() => validateRuntime(adapter, manifest)).not.toThrow();
      manifest.routes = [
        {
          id: "home",
          path: "/",
          file: "page.ts",
          mode: "ssr",
          runtime: name === "bun" ? "node" : "bun",
          decision: "test",
          clientEntries: [],
        },
      ];
    }
    expect(() => validateRuntime(adapter, manifest)).toThrow(
      "Request context supports only matching Bun or Node",
    );
    manifest.requestContext = false;
    expect(() => validateRuntime(adapter, manifest)).not.toThrow();
  }
});
