import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createRequestHandler } from "@tschk/moonshine-server";
import { buildProjectIsolated } from "./build-in-subprocess";
import { readManifest } from "../src/manifest";

test("generated native entries preserve quoted paths and prototype-named route IDs", async () => {
  const project = await mkdtemp(join(import.meta.dir, "fixtures/generated-"));
  const special = sep === "\\" ? "quoted' file" : `quoted"' file`;
  const sources = {
    page: `src/${special}.ts`,
    data: `src/${special}-data.ts`,
    layout: `src/${special}-layout.ts`,
    middleware: `src/${special}-middleware.ts`,
    client: `src/${special}-client.ts`,
    api: `src/${special}-api.ts`,
  };
  try {
    await mkdir(join(project, "src/routes"), { recursive: true });
    await mkdir(join(project, "node_modules/@tschk"), { recursive: true });
    await symlink(
      resolve(import.meta.dir, "../../dom"),
      join(project, "node_modules/@tschk/moonshine-dom"),
    );
    await Promise.all([
      writeFile(
        join(project, sources.page),
        `import { h } from "@tschk/moonshine-dom/ssr"; export default (props: any) => h("p", null, (Object.values(props.data)[0] as any)?.label);`,
      ),
      writeFile(
        join(project, sources.data),
        `export const loader = () => ({ label: "quoted data" });`,
      ),
      writeFile(
        join(project, sources.layout),
        `import { h } from "@tschk/moonshine-dom/ssr"; export default (props: any) => h("section", { title: "layout" }, props.children);`,
      ),
      writeFile(
        join(project, sources.middleware),
        `export const before = [async (_context: any, next: () => Promise<Response>) => { const response = await next(); response.headers.set("x-special", "loaded"); return response; }];`,
      ),
      writeFile(
        join(project, sources.api),
        `export const GET = () => new Response("constructor handled"); export default () => null;`,
      ),
      writeFile(
        join(project, sources.client),
        `export default () => "prototype client mounted";`,
      ),
    ]);
    const specialPattern = '/quote"\\pattern';
    await buildProjectIsolated({
      projectDir: project,
      renderer: "native",
      programmatic: [
        {
          id: "__proto__",
          path: "/proto",
          file: sources.page,
          dataFile: sources.data,
          layouts: [sources.layout],
          middleware: [sources.middleware],
          mode: "ssr",
        },
        {
          id: "constructor",
          path: "/constructor",
          file: sources.api,
          mode: "api",
        },
        {
          id: 'quote"\\id',
          path: specialPattern,
          file: sources.api,
          mode: "api",
        },
      ],
    });
    const out = join(project, ".moonshine");
    const manifest = await readManifest(join(out, "manifest.json"));
    expect(
      manifest.routes.find((route) => route.id === "__proto__")!.file,
    ).toBe(sources.page);
    const bundle = await import(join(out, "dist/server.js"));
    for (const id of ["__proto__", "constructor", 'quote"\\id'])
      expect(Object.hasOwn(bundle.modules, id)).toBe(true);
    for (const file of [
      sources.page,
      sources.data,
      sources.layout,
      sources.middleware,
    ]) {
      expect(Object.hasOwn(bundle.modules, file)).toBe(true);
      expect(bundle.modules[file]).toBe(bundle.modules[join(project, file)]);
    }
    expect(Object.hasOwn(bundle.routes, specialPattern)).toBe(true);
    expect(Object.getPrototypeOf(bundle.modules)).toBe(Object.prototype);
    const handler = createRequestHandler({
      manifest,
      modules: bundle.modules,
      renderer: bundle.renderer,
    });
    const response = await handler(new Request("http://test/proto"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-special")).toBe("loaded");
    expect(await response.text()).toContain(
      '<section title="layout"><p>quoted data</p></section>',
    );
    expect(
      await (await handler(new Request("http://test/constructor"))).text(),
    ).toBe("constructor handled");

    const spaOut = join(project, ".spa");
    await buildProjectIsolated({
      projectDir: project,
      outDir: spaOut,
      renderer: "native",
      programmatic: [
        {
          id: "__proto__",
          path: "/app",
          file: sources.page,
          clientFile: sources.client,
          mode: "spa",
        },
      ],
    });
    await import("../../react/test/dom");
    const root = document.createElement("main");
    root.setAttribute("data-moonshine-app", "__proto__");
    document.body.append(root);
    try {
      await import(join(spaOut, "public/client.js"));
      expect(root.textContent).toBe("prototype client mounted");
    } finally {
      window.dispatchEvent(new Event("pagehide"));
      root.remove();
    }
    const reactOut = join(project, ".react");
    await buildProjectIsolated({
      projectDir: project,
      outDir: reactOut,
      programmatic: [
        {
          id: 'quote"\\id',
          path: specialPattern,
          file: sources.api,
          mode: "island",
        },
      ],
    });
    const client = await import(join(reactOut, "public/client.js"));
    expect(Object.hasOwn(client.islands, specialPattern)).toBe(true);
    expect(typeof client.islands[specialPattern]).toBe("function");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}, 20000);
