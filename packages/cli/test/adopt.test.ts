import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildCommand } from "../src/build";
import { planAdoption, applyPlan, formatReport } from "../src/adopt";
import { startPreview } from "../src/preview";

const fixture = join(import.meta.dir, "fixtures", "next-app");
const tmp = join(import.meta.dir, ".tmp-cli-adopt");

function clean() {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

function project(name: string): string {
  const dir = join(tmp, name);
  cpSync(fixture, dir, { recursive: true });
  return dir;
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

beforeAll(clean);
afterAll(clean);

describe("moonshine adopt — scan", () => {
  test("identifies the App Router, its routes, and its next/* imports", async () => {
    const dir = project("scan");
    const { scan } = await planAdoption(dir);

    expect(scan.framework).toBe("next-app");
    expect(scan.routesDir).toBe("app");
    expect(scan.convention).toBe("next-app");
    expect(scan.routes.map((r) => r.path).sort()).toEqual([
      "/",
      "/about",
      "/api/hello",
    ]);

    const specifiers = new Set(scan.imports.map((i) => i.specifier));
    expect(specifiers.has("next/link")).toBe(true);
    expect(specifiers.has("next/font/google")).toBe(true);
    expect(scan.imports.every((i) => i.aliasable)).toBe(true);
    expect(scan.conventions).toContain("next.config.mjs");
    expect(scan.conventions).toContain("middleware.ts");
  });

  test("reports the work it cannot automate", async () => {
    const dir = project("manual");
    const { scan } = await planAdoption(dir);
    const joined = scan.manual.join("\n");

    expect(joined).toContain("middleware.ts");
    expect(joined).toContain("next.config.mjs");
    expect(joined).toContain("metadata");
    expect(joined).toContain("app/layout.tsx");
    // Caveats are raised only for the specifiers the app actually imports.
    expect(joined).toContain("next/font/google");
    expect(joined).not.toContain("next/image");
  });
});

describe("moonshine adopt — rewrite", () => {
  test("--dry-run writes nothing", async () => {
    const dir = project("dry");
    const before = readFileSync(join(dir, "tsconfig.json"), "utf8");
    const plan = await planAdoption(dir);
    const report = formatReport(plan, true);

    expect(report).toContain("dry run");
    expect(report).toContain("Nothing was written");
    expect(readFileSync(join(dir, "tsconfig.json"), "utf8")).toBe(before);
    expect(existsSync(join(dir, "moonshine.config.ts"))).toBe(false);
  });

  test("aliases next/* through tsconfig paths and is idempotent", async () => {
    const dir = project("apply");
    applyPlan(await planAdoption(dir));

    const tsconfig = json<{
      compilerOptions: { paths: Record<string, string[]> };
    }>(join(dir, "tsconfig.json"));
    const paths = tsconfig.compilerOptions.paths;
    expect(paths["next/link"]![0]).toContain("moonshine-next");
    expect(paths["next/font/google"]![0]).toContain("font/google.ts");
    // Each alias target must be a real file, or Bun silently keeps `next/*`.
    for (const [specifier, [target]] of Object.entries(paths)) {
      expect(`${specifier} -> ${existsSync(join(dir, target!))}`).toBe(
        `${specifier} -> true`,
      );
    }

    const config = readFileSync(join(dir, "moonshine.config.ts"), "utf8");
    expect(config).toContain(`"convention": "next-app"`);
    expect(config).toContain(`"routesDir": "app"`);

    const pkg = json<{
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    }>(join(dir, "package.json"));
    expect(pkg.scripts.dev).toBe("moonshine dev");
    expect(pkg.scripts.build).toBe("moonshine build");
    expect(pkg.dependencies["@tschk/moonshine-next"]).toBeDefined();
    expect(pkg.dependencies.next).toBeUndefined();

    // Second run must be a no-op on every file it touched.
    const second = await planAdoption(dir);
    expect(second.changes.every((c) => c.alreadyApplied)).toBe(true);
    const snapshot = readFileSync(join(dir, "tsconfig.json"), "utf8");
    applyPlan(second);
    expect(readFileSync(join(dir, "tsconfig.json"), "utf8")).toBe(snapshot);
  });
});

describe("moonshine adopt — end to end", () => {
  test("an App Router app builds and renders on moonshine with no next installed", async () => {
    const dir = project("e2e");
    applyPlan(await planAdoption(dir));

    // The proof: nothing in the tree depends on `next` any more.
    const pkg = json<{ dependencies: Record<string, string> }>(
      join(dir, "package.json"),
    );
    expect(pkg.dependencies.next).toBeUndefined();
    expect(existsSync(join(dir, "node_modules", "next"))).toBe(false);

    const manifest = await buildCommand([dir]);
    expect(manifest.routes.map((r) => r.path).sort()).toEqual([
      "/",
      "/about",
      "/api/hello",
    ]);

    const bundle = readFileSync(
      join(dir, ".moonshine", manifest.entries.server!),
      "utf8",
    );
    expect(bundle).not.toContain("node_modules/next/");

    const preview = await startPreview({ projectDir: dir, port: 0 });
    try {
      const home = await fetch(new URL("/", preview.url).href);
      expect(home.status).toBe(200);
      const html = await home.text();
      // Only the moonshine next/font implementation emits this class name.
      expect(html).toContain("__moonshine_font_inter");
      expect(html).toContain('data-fixture-layout="root"');
      expect(html).toContain('data-fixture-page="home"');
      expect(html).toContain('href="/about"');
      expect(html).toContain("data-fixture-counter");

      const about = await fetch(new URL("/about", preview.url).href);
      expect(about.status).toBe(200);
      expect(await about.text()).toContain('data-fixture-page="about"');

      const api = await fetch(new URL("/api/hello", preview.url).href);
      expect(api.status).toBe(200);
      expect(await api.text()).toContain("moonshine");
    } finally {
      await preview.stop();
    }
  }, 60_000);
});
