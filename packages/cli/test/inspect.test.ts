import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { MoonshineManifest } from "@tschk/moonshine-framework";
import { formatInspection, inspectCommand } from "../src/inspect";

const sample: MoonshineManifest = {
  version: 1,
  frameworkVersion: "0.2.0",
  routes: [
    {
      id: "home",
      path: "/",
      file: "src/routes/index.tsx",
      mode: "static",
      runtime: "bun",
      decision: "deterministic build-time route",
      clientEntries: [],
    },
    {
      id: "counter",
      path: "/counter",
      file: "src/routes/counter.tsx",
      mode: "island",
      runtime: "bun",
      decision: "contains an interactive client subtree",
      clientEntries: ["dist/client.js"],
      serverEntry: "dist/server.js",
    },
    {
      id: "api-health",
      path: "/api/health",
      file: "src/routes/api/health.ts",
      mode: "api",
      runtime: "bun",
      decision: "exports request handler",
      clientEntries: [],
      serverEntry: "dist/server.js",
    },
  ],
  assets: [],
  entries: { server: "dist/server.js", client: "dist/client.js" },
  capabilities: ["islands", "streaming"],
};

const tmp = mkdtempSync(join(tmpdir(), "moonshine-inspect-"));
const manifestPath = join(tmp, "manifest.json");

beforeAll(() => {
  writeFileSync(manifestPath, JSON.stringify(sample, null, 2) + "\n");
});

afterAll(() => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: string | Uint8Array,
    ..._rest: unknown[]
  ): boolean => {
    output.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  };
  return {
    output,
    restore: () => {
      process.stdout.write = original;
    },
  };
}

describe("inspect", () => {
  test("formatInspection outputs deterministic route lines", () => {
    const text = formatInspection(sample);
    expect(text).toBe(
      "static  /            deterministic build-time route\nisland  /counter     contains an interactive client subtree\napi     /api/health  exports request handler\n",
    );
  });

  test("inspectCommand --json prints manifest unchanged", async () => {
    const { output, restore } = captureStdout();
    try {
      await inspectCommand(["--json", manifestPath]);
    } finally {
      restore();
    }
    expect(output.join("")).toBe(JSON.stringify(sample, null, 2) + "\n");
  });

  test("inspectCommand prints formatted routes", async () => {
    const { output, restore } = captureStdout();
    try {
      await inspectCommand([manifestPath]);
    } finally {
      restore();
    }
    const text = output.join("");
    expect(text).toContain("static");
    expect(text).toContain("island");
    expect(text).toContain("api");
    expect(text).toContain("deterministic build-time route");
    expect(text).toContain("contains an interactive client subtree");
    expect(text).toContain("exports request handler");
  });
});
