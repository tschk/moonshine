import { describe, expect, test } from "bun:test";
import {
  planTemplateRoutes,
  compileTemplates,
  componentModule,
  templateRoute,
} from "../../src/adopt/templates.js";
import { buildProjectIsolated } from "../../../compiler/test/build-in-subprocess";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AdoptScan } from "../../src/adopt/types.js";

describe("templateRoute", () => {
  test("mounts SvelteKit pages, including groups and layout resets", () => {
    expect(templateRoute("src/routes/+page.svelte", "svelte")).toBe("/");
    expect(
      templateRoute("src/routes/(app)/account/+page.svelte", "svelte"),
    ).toBe("/account");
    expect(templateRoute("src/routes/account/+page@.svelte", "svelte")).toBe(
      "/account",
    );
    expect(templateRoute("src/routes/account/+page@app.svelte", "svelte")).toBe(
      "/account",
    );
  });

  test("keeps layouts, errors and colocated Svelte components unmounted", () => {
    for (const file of [
      "+layout.svelte",
      "+error.svelte",
      "Counter.svelte",
      "App.svelte",
      "+page-extra.svelte",
    ]) {
      expect(
        templateRoute(`src/routes/account/${file}`, "svelte"),
      ).toBeUndefined();
    }
  });

  test("preserves standalone Svelte roots and other framework routes", () => {
    expect(templateRoute("src/App.svelte", "svelte")).toBe("/");
    expect(templateRoute("src/pages/about.vue", "vue")).toBe("/about");
    expect(templateRoute("src/pages/about.astro", "astro")).toBe("/about");
    expect(templateRoute("src/app.component.html", "angular")).toBeUndefined();
  });
});

describe("planTemplateRoutes", () => {
  test("re-throws non-ENOENT errors when reading existing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "moonshine-plan-"));
    await writeFile(join(dir, "blocked"), "file");
    const scan: AdoptScan = {
      projectDir: dir,
      framework: "svelte",
      routes: [],
      imports: [],
      conventions: [],
      templates: [
        {
          file: "src/routes/+page.svelte",
          ok: true,
          route: "/",
          nodes: 10,
          irVersion: 7,
          ir: { root: [], version: 7, kind: "template" },
          generated: "moonshine/routes/index.ts",
          component: "blocked/component.ssr.ts",
          source: "export default () => null;",
        },
      ],
      manual: [],
    };

    try {
      await expect(planTemplateRoutes(scan)).rejects.toThrow("ENOTDIR");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test("empty template sets do not require a compiler", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-empty-templates-"));
  try {
    expect(
      await compileTemplates(
        dir,
        "angular",
        ["**/*.ng"],
        join(dir, "missing-compiler"),
      ),
    ).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("component output paths preserve source filenames without slug collisions", () => {
  const files = [
    "pages/a+b.vue",
    "pages/a-b.vue",
    "foo.ng",
    "foo.component.html",
    "components/name with spaces.svelte",
  ];
  const outputs = files.map(componentModule);
  expect(new Set(outputs).size).toBe(files.length);
  for (let index = 0; index < files.length; index++)
    expect(outputs[index]).toBe(`moonshine/components/${files[index]}.ssr.ts`);
});

test("reserved route basenames retain their URLs as SSR wrappers", async () => {
  const { generatedModule } = await import("../../src/adopt/templates");
  const { discoverRoutes } = await import("../../../compiler/src/discover");
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "moonshine-reserved-routes-"));
  const routes = [
    "/",
    "/index",
    "/nested/index",
    "/+foo",
    "/foo.data",
    "/foo.server",
    "/foo.client",
    "/ordinary",
  ];
  try {
    const outputs = routes.map(generatedModule);
    expect(new Set(outputs).size).toBe(routes.length);
    const scan: AdoptScan = {
      projectDir: dir,
      framework: "vue",
      routes: [],
      imports: [],
      conventions: [],
      manual: [],
      templates: routes.map((route, index) => ({
        file: `src/pages/page${index}.vue`,
        route,
        ok: true,
        generated: generatedModule(route),
        component: `moonshine/components/page${index}.vue.ssr.ts`,
        source: "export default () => null;",
      })),
    };
    for (const change of await planTemplateRoutes(scan)) {
      await mkdir(dirname(join(dir, change.file)), { recursive: true });
      await writeFile(join(dir, change.file), change.contents!);
    }
    const found = await discoverRoutes({
      routesDir: join(dir, "moonshine/routes"),
    });
    expect(found.map((route) => route.path).toSorted()).toEqual(
      routes.toSorted(),
    );
    expect(found.every((route) => route.mode === undefined)).toBe(true); // Config mode:ssr applies, with no accidental API suffix.
    expect(found).toHaveLength(routes.length);
    await mkdir(join(dir, "node_modules/@tschk"), { recursive: true });
    await symlink(
      resolve(import.meta.dir, "../../../dom"),
      join(dir, "node_modules/@tschk/moonshine-dom"),
    );
    await buildProjectIsolated({
      projectDir: dir,
      routesDir: join(dir, "moonshine/routes"),
      renderer: "native",
      mode: "ssr",
    });
    const manifest = (await Bun.file(
      join(dir, ".moonshine/manifest.json"),
    ).json()) as { routes: Array<{ path: string; mode: string }> };
    expect(manifest.routes.map((route) => route.path).toSorted()).toEqual(
      routes.toSorted(),
    );
    expect(manifest.routes.every((route) => route.mode === "ssr")).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

test("unsafe legacy reserved wrappers refuse before emission or writes", async () => {
  const { mkdir } = await import("node:fs/promises");
  for (const suffix of [
    "index",
    "+foo",
    "foo.data",
    "foo.server",
    "foo.client",
  ]) {
    const dir = await mkdtemp(join(tmpdir(), "moonshine-old-reserved-"));
    try {
      await mkdir(join(dir, "src/pages"), { recursive: true });
      const source =
        suffix === "index"
          ? "src/pages/index/index.vue"
          : `src/pages/${suffix}.vue`;
      const { dirname } = await import("node:path");
      await mkdir(dirname(join(dir, source)), { recursive: true });
      await writeFile(join(dir, source), "<p>source</p>");
      await mkdir(join(dir, "moonshine/routes"), { recursive: true });
      const previous = join(dir, `moonshine/routes/${suffix}.tsx`);
      await writeFile(previous, "legacy untouched");
      await expect(
        compileTemplates(dir, "vue", ["**/*.vue"], process.execPath),
      ).rejects.toThrow("retire it manually");
      expect(await Bun.file(previous).text()).toBe("legacy untouched");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("duplicate planned paths are rejected instead of overwritten", async () => {
  const scan: AdoptScan = {
    projectDir: "/unused",
    framework: "vue",
    routes: [],
    imports: [],
    conventions: [],
    manual: [],
    templates: [0, 1].map((index) => ({
      file: `page${index}.vue`,
      route: `/page${index}`,
      ok: true,
      generated: "moonshine/routes/collision.ts",
      component: `moonshine/components/page${index}.ssr.ts`,
      source: "export default () => null;",
    })),
  };
  await expect(planTemplateRoutes(scan)).rejects.toThrow(
    "Conflicting planned output path",
  );
});
