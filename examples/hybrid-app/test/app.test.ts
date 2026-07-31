import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { buildCommand } from "../../../packages/cli/src/build";
import { startPreview } from "../../../packages/cli/src/preview";
import { formatInspection } from "../../../packages/cli/src/inspect";
import { readManifest } from "../../../packages/compiler/src/manifest";

const projectDir = resolve(import.meta.dir, "..");
const outDir = resolve(projectDir, ".moonshine");

function clean() {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
}

let preview: { url: URL; stop: () => Promise<void> } | undefined;

beforeAll(async () => {
  clean();
  await buildCommand([projectDir]);
});

afterAll(async () => {
  if (preview) {
    await preview.stop();
    preview = undefined;
  }
  clean();
});

describe("hybrid-app", () => {
  test("manifest contains all five modes", async () => {
    const manifest = await readManifest(resolve(outDir, "manifest.json"));
    const modes = Object.fromEntries(
      manifest.routes.map((r) => [r.path, r.mode]),
    );
    expect(modes).toEqual({
      "/": "static",
      "/counter": "island",
      "/account/:id": "ssr",
      "/dashboard/*": "spa",
      "/api/health": "api",
    });
  });

  test("inspect reports exact modes", async () => {
    const manifest = await readManifest(resolve(outDir, "manifest.json"));
    const text = formatInspection(manifest);
    expect(text).toContain("static  /");
    expect(text).toContain("island  /counter");
    expect(text).toContain("ssr     /account/:id");
    expect(text).toContain("spa     /dashboard/*");
    expect(text).toContain("api     /api/health");
  });

  test("serves all five modes", async () => {
    preview = await startPreview({ projectDir, port: 0 });

    const home = await fetch(new URL("/", preview.url));
    expect(home.status).toBe(200);
    const homeText = await home.text();
    expect(homeText).toContain("<h1>home</h1>");
    expect(homeText).not.toContain("<script");

    const counter = await fetch(new URL("/counter", preview.url));
    expect(counter.status).toBe(200);
    const counterText = await counter.text();
    expect(counterText).toContain("<h1>counter</h1>");
    expect(counterText).toContain("<button");
    expect(counterText).toContain("<script");

    const account = await fetch(new URL("/account/42", preview.url));
    expect(account.status).toBe(200);
    const accountText = await account.text();
    expect(accountText).toContain("account");
    expect(accountText).toContain(">42</p>");

    const dashboard = await fetch(new URL("/dashboard/foo/bar", preview.url));
    expect(dashboard.status).toBe(200);
    const dashboardText = await dashboard.text();
    expect(dashboardText).toContain('id="moonshine-app"');
    expect(dashboardText).toContain("<script");

    const health = await fetch(new URL("/api/health", preview.url));
    expect(health.status).toBe(200);
    expect(health.headers.get("content-type")).toContain("application/json");
    const body = (await health.json()) as { status: string };
    expect(body.status).toBe("ok");
  }, 30000);
});
