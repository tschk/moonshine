import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildProject } from "../src/manifest";

/**
 * The server bundle must carry every module the server renders through, not
 * just the page.
 *
 * A page's layout is loaded during server rendering. When it is missing from
 * `modules`, the renderer falls back to `await import(file)` on the layout's
 * SOURCE path. That resolves in a checkout, where the source sits beside the
 * build output, and fails in a deployed image that ships only the build — so
 * the route renders locally and returns 500 in production. It also fails
 * outright on runtimes that cannot resolve a dynamic import.
 */

const projectDir = resolve(import.meta.dir, "fixtures", "project");
const outDir = join(projectDir, ".moonshine");

function clean() {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
}

afterAll(clean);

describe("server bundle support modules", () => {
  test("registers the layouts its routes render through", async () => {
    const manifest = await buildProject({ projectDir });

    const layouts = [
      ...new Set(manifest.routes.flatMap((route) => route.layouts ?? [])),
    ];
    expect(layouts.length).toBeGreaterThan(0);

    const { modules } = await import(join(outDir, "dist", "server.js"));
    // The bundle keys modules by their build-time absolute path, while the
    // manifest stores them relative to the project.
    for (const layout of layouts) {
      expect(Object.keys(modules)).toContain(join(projectDir, layout));
    }
  });

  test("a registered layout is the real module, not a route wrapper", async () => {
    const manifest = await buildProject({ projectDir });
    const layout = join(
      projectDir,
      manifest.routes.flatMap((route) => route.layouts ?? [])[0]!,
    );

    const { modules } = await import(join(outDir, "dist", "server.js"));

    // Layouts export a component; wrapping them in loader/action semantics
    // would make the renderer read `default` off the wrong object.
    expect(modules[layout]).toBeDefined();
    expect(typeof modules[layout].default).toBe("function");
  });

  test("still registers pages by id and file", async () => {
    const manifest = await buildProject({ projectDir });
    const route = manifest.routes[0]!;

    const { modules } = await import(join(outDir, "dist", "server.js"));

    expect(modules[route.id]).toBeDefined();
    expect(modules[join(projectDir, route.file)]).toBeDefined();
  });
});
