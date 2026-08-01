import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildCommand } from "../src/build";
import {
  planAdoption,
  applyPlan,
  formatReport,
  formatPlan,
  adoptCommand,
  findProjectRoot,
} from "../src/adopt";
import type { Tui } from "../src/tui";
import { startPreview } from "../src/preview";

const fixture = join(import.meta.dir, "fixtures", "next-app");
const svelteFixture = join(import.meta.dir, "fixtures", "svelte-app");
const vueFixture = join(import.meta.dir, "fixtures", "vue-app");
const astroFixture = join(import.meta.dir, "fixtures", "astro-app");
const tmp = join(import.meta.dir, ".tmp-cli-adopt");

function clean() {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

function project(name: string, from = fixture): string {
  const dir = join(tmp, name);
  cpSync(from, dir, { recursive: true });
  return dir;
}

type FakeTui = Tui & { output: string; asked: number };

function fakeTui(
  answer: string,
  options: { isTTY?: boolean; columns?: number } = {},
): FakeTui {
  const tui: FakeTui = {
    isTTY: options.isTTY ?? true,
    columns: options.columns ?? 80,
    output: "",
    asked: 0,
    write(text) {
      tui.output += text;
    },
    async prompt(question) {
      tui.asked++;
      tui.output += question;
      return answer;
    },
  };
  return tui;
}

/** Every file in `dir`, keyed by project-relative path, for untouched assertions. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[path.slice(dir.length)] = readFileSync(path, "utf8");
  }
  return files;
}

const ESC = String.fromCharCode(27);

/** Drop SGR escapes so a line can be measured in terminal columns. */
function plain(line: string): string {
  return line
    .split(ESC)
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf("m") + 1)))
    .join("");
}

async function inDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
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

describe("moonshine adopt — project detection", () => {
  test("with no argument it adopts the project the cwd sits inside", async () => {
    const dir = project("detect-cwd");
    const result = await inDir(dir, () => adoptCommand(["--yes"], fakeTui("")));

    expect(result.code).toBe(0);
    expect(result.plan!.scan.projectDir).toBe(dir);
    expect(result.plan!.scan.framework).toBe("next-app");
    expect(existsSync(join(dir, "moonshine.config.ts"))).toBe(true);
  });

  test("it walks up from a nested subdirectory to the project root", async () => {
    const dir = project("detect-nested");
    const nested = join(dir, "app", "api", "hello");
    expect(findProjectRoot(nested)).toBe(dir);

    const result = await inDir(nested, () =>
      adoptCommand(["--yes"], fakeTui("")),
    );
    expect(result.code).toBe(0);
    expect(result.plan!.scan.projectDir).toBe(dir);
  });

  test("a framework with no crepuscularity frontend is refused and writes nothing", async () => {
    const dir = project("astro", astroFixture);
    const before = snapshot(dir);

    const result = await inDir(dir, () => adoptCommand(["--yes"], fakeTui("")));

    expect(result.code).toBe(1);
    expect(result.applied).toBe(false);
    expect(snapshot(dir)).toEqual(before);
    expect(existsSync(join(dir, "moonshine.config.ts"))).toBe(false);
  });
});

describe("moonshine adopt — confirmation", () => {
  test("the plan names every file and key before the yellow warning bar", async () => {
    const dir = project("confirm-plan");
    const plan = await planAdoption(dir);
    const text = formatPlan(plan, { isTTY: true, columns: 80 });

    expect(text).toContain("modify    tsconfig.json");
    expect(text).toContain("create    moonshine.config.ts");
    expect(text).toContain(`compilerOptions.paths["next/link"]`);
    expect(text).toContain(`dependencies["@tschk/moonshine-next"]`);

    const bar = text.split("\n").at(-1)!;
    expect(bar.startsWith(`${ESC}[30;43m`)).toBe(true);
    expect(bar.endsWith(`${ESC}[0m`)).toBe(true);
    // The bar is exactly one terminal row wide, at any width.
    expect(plain(bar)).toHaveLength(80);
    const narrow = formatPlan(plan, { isTTY: true, columns: 40 });
    expect(plain(narrow.split("\n").at(-1)!)).toHaveLength(40);
    for (const line of narrow.split("\n")) {
      expect(plain(line).length).toBeLessThanOrEqual(40);
    }
  });

  test("answering anything but yes writes nothing", async () => {
    const dir = project("confirm-no");
    const before = snapshot(dir);
    const tui = fakeTui("n");

    const result = await inDir(dir, () => adoptCommand([], tui));

    expect(tui.asked).toBe(1);
    expect(result.code).toBe(1);
    expect(result.applied).toBe(false);
    expect(snapshot(dir)).toEqual(before);
    expect(tui.output).toContain("Aborted");
  });

  test("answering yes applies the plan", async () => {
    const dir = project("confirm-yes");
    const tui = fakeTui("YES");

    const result = await inDir(dir, () => adoptCommand([], tui));

    expect(tui.asked).toBe(1);
    expect(result.code).toBe(0);
    expect(existsSync(join(dir, "moonshine.config.ts"))).toBe(true);
  });

  test("--yes skips the prompt and writes", async () => {
    const dir = project("confirm-flag");
    const tui = fakeTui("");

    const result = await inDir(dir, () => adoptCommand(["-y"], tui));

    expect(tui.asked).toBe(0);
    expect(result.code).toBe(0);
    expect(existsSync(join(dir, "moonshine.config.ts"))).toBe(true);
  });

  test("--dry-run never prompts and writes nothing", async () => {
    const dir = project("confirm-dry");
    const before = snapshot(dir);
    const tui = fakeTui("n");

    const result = await inDir(dir, () => adoptCommand(["--dry-run"], tui));

    expect(tui.asked).toBe(0);
    expect(result.code).toBe(0);
    expect(result.applied).toBe(false);
    expect(snapshot(dir)).toEqual(before);
  });

  test("without a TTY it refuses instead of hanging, and stays plain text", async () => {
    const dir = project("confirm-ci");
    const before = snapshot(dir);
    const tui = fakeTui("y", { isTTY: false });

    const result = await inDir(dir, () => adoptCommand([], tui));

    expect(tui.asked).toBe(0);
    expect(result.code).toBe(1);
    expect(snapshot(dir)).toEqual(before);
    expect(tui.output).toContain("--yes");
    expect(tui.output).not.toContain(`${ESC}[`);
  });
});

describe("moonshine adopt — svelte and vue templates", () => {
  test("svelte templates compile to View IR and become generated routes", async () => {
    const dir = project("svelte", svelteFixture);
    const result = await inDir(dir, () => adoptCommand(["--yes"], fakeTui("")));

    expect(result.code).toBe(0);
    const scan = result.plan!.scan;
    expect(scan.framework).toBe("svelte");
    expect(scan.templates.every((t) => t.ok)).toBe(true);
    expect(
      scan.templates
        .filter((t) => t.route)
        .map((t) => t.route)
        .sort(),
    ).toEqual(["/", "/about"]);

    const generated = readFileSync(
      join(dir, "moonshine", "routes", "index.tsx"),
      "utf8",
    );
    expect(generated).toContain("renderCrepusIr");
    expect(generated).toContain("svelte on moonshine");
    // Source templates are never edited.
    expect(readFileSync(join(dir, "src/routes/+page.svelte"), "utf8")).toBe(
      readFileSync(join(svelteFixture, "src/routes/+page.svelte"), "utf8"),
    );

    const joined = scan.manual.join("\n");
    expect(joined).toContain("<script> blocks are not executed");
    expect(joined).toContain("src/lib/Card.svelte");
  });

  test("an adopted svelte app builds and serves its templates as HTML", async () => {
    const dir = project("svelte-e2e", svelteFixture);
    await inDir(dir, () => adoptCommand(["--yes"], fakeTui("")));

    const manifest = await buildCommand([dir]);
    expect(manifest.routes.map((r) => r.path).sort()).toEqual(["/", "/about"]);

    const preview = await startPreview({ projectDir: dir, port: 0 });
    try {
      const home = await fetch(new URL("/", preview.url).href);
      expect(home.status).toBe(200);
      const html = await home.text();
      expect(html).toContain('data-crepus-ir-version="7"');
      expect(html).toContain("svelte on moonshine");
      expect(html).toContain('class="home"');

      const about = await fetch(new URL("/about", preview.url).href);
      expect(await about.text()).toContain("about this app");
    } finally {
      await preview.stop();
    }
  }, 60_000);

  test("vue templates compile and the run is idempotent", async () => {
    const dir = project("vue", vueFixture);
    const first = await inDir(dir, () => adoptCommand(["--yes"], fakeTui("")));
    expect(first.code).toBe(0);
    expect(first.plan!.scan.framework).toBe("vue");

    const after = snapshot(dir);
    const second = await inDir(dir, () => adoptCommand(["--yes"], fakeTui("")));
    expect(second.plan!.changes.every((c) => c.alreadyApplied)).toBe(true);
    expect(snapshot(dir)).toEqual(after);
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
