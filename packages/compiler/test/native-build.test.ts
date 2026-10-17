import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildProjectIsolated } from "./build-in-subprocess";
import { createRequestHandler } from "@tschk/moonshine-server";
import { readManifest } from "../src/manifest";

test("native bundles keep server modules private and execute explicit SPA clients", async () => {
  const projectDir = await mkdtemp(join(import.meta.dir, "fixtures/native-"));
  try {
    await mkdir(join(projectDir, "src/routes"), { recursive: true });
    await mkdir(join(projectDir, "node_modules/@tschk"), { recursive: true });
    await symlink(
      resolve(import.meta.dir, "../../dom"),
      join(projectDir, "node_modules/@tschk/moonshine-dom"),
    );
    await writeFile(
      join(projectDir, "src/routes/index.ts"),
      `
export function loader() { return { private: "SERVER_ONLY_SECRET_MARKER" }; }
export default function Page() { throw new Error("SPA server page must not execute"); }
`,
    );
    await writeFile(
      join(projectDir, "src/layout.ts"),
      `
export function loader() { return { layoutLoaded: true }; }
export default function Layout(props) { return props.children; }
`,
    );
    await writeFile(
      join(projectDir, "src/data.ts"),
      `export function loader() { return { label: "data-loaded" }; }`,
    );
    await writeFile(
      join(projectDir, "src/middleware.ts"),
      `
export const before = [async (context, next) => {
  const response = await next();
  response.headers.set("x-native-middleware", "ran");
  return response;
}];
`,
    );
    await writeFile(
      join(projectDir, "src/client.ts"),
      `
import { h } from "@tschk/moonshine-dom/dom";
import { createSignal } from "@tschk/moonshine-dom/reactive";
import { getComponentContext, setContext } from "@tschk/moonshine-dom/component";
export default function Page(props) {
  if (getComponentContext().mode !== "dom") throw new Error("Expected DOM component setup");
  setContext("label", props.data.label);
  const [count, setCount] = createSignal(0);
  return h("button", { onClick: () => setCount(count() + 1) }, () => props.data.label + ":" + count());
}
`,
    );
    await buildProjectIsolated({
      projectDir,
      renderer: "native",
      programmatic: [
        {
          id: "index",
          path: "/",
          file: "src/routes/index.ts",
          mode: "spa",
          clientFile: "src/client.ts",
          dataFile: "src/data.ts",
          layouts: ["src/layout.ts"],
          middleware: ["src/middleware.ts"],
        },
      ],
    });
    const out = join(projectDir, ".moonshine");
    const manifest = await readManifest(join(out, "manifest.json"));
    expect(manifest.renderer).toBe("native");
    expect(manifest.capabilities).not.toContain("streaming");
    expect(manifest.capabilities).not.toContain("islands");
    expect(manifest.routes[0]!.clientFile).toBe("src/client.ts");
    const server = await Bun.file(join(out, "dist/server.js")).text();
    const client = await Bun.file(join(out, "public/client.js")).text();
    const bootstrap = await Bun.file(join(out, ".build/client.ts")).text();
    expect(server).toContain("SERVER_ONLY_SECRET_MARKER");
    expect(server).not.toContain("node:async_hooks");
    expect(server).not.toContain("AsyncLocalStorage");
    expect(client).not.toContain("SERVER_ONLY_SECRET_MARKER");
    expect(client).not.toContain("SPA server page must not execute");
    expect(client).not.toContain("react-dom");
    expect(client).not.toContain("node_modules/solid-js");
    expect(bootstrap).toContain("src/client.ts");
    expect(bootstrap).not.toContain("src/routes/index.ts");
    expect(bootstrap).toContain("render(() => h(page, props), root)");
    const bundle = await import(join(out, "dist/server.js"));
    expect(bundle.renderer.name).toBe("native");
    for (const file of [
      "src/routes/index.ts",
      "src/data.ts",
      "src/layout.ts",
      "src/middleware.ts",
    ]) {
      expect(bundle.modules[file]).toBe(bundle.modules[join(projectDir, file)]);
    }
    const handler = createRequestHandler({
      manifest,
      modules: bundle.modules,
      renderer: bundle.renderer,
    });
    const response = await handler(new Request("http://localhost/"));
    expect(response.headers.get("x-native-middleware")).toBe("ran");
    const html = await response.text();
    expect(html).toContain("layoutLoaded");
    expect(html).toContain("data-loaded");

    await import("../../react/test/dom");
    const root = document.createElement("main");
    root.setAttribute("data-moonshine-app", "index");
    const payload = document.createElement("script");
    payload.type = "application/json";
    payload.setAttribute("data-moonshine-props", "");
    payload.textContent = JSON.stringify({
      params: {},
      data: { label: "count" },
    });
    document.body.append(root, payload);
    try {
      await import(join(out, "public/client.js"));
      const button = root.querySelector("button")!;
      expect(button.textContent).toBe("count:0");
      button.click();
      expect(button.textContent).toBe("count:1");
    } finally {
      window.dispatchEvent(new Event("pagehide"));
      root.remove();
      payload.remove();
    }
    await writeFile(
      join(projectDir, "src/client.ts"),
      `
import "./routes/index";
export default function Page() { return "client"; }
`,
    );
    await expect(
      buildProjectIsolated({
        projectDir,
        renderer: "native",
        programmatic: [
          {
            id: "index",
            path: "/",
            file: "src/routes/index.ts",
            mode: "spa",
            clientFile: "src/client.ts",
          },
        ],
      }),
    ).rejects.toThrow("Native client imports server-only route module");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("native rejects unsupported hydration and implicit client imports", async () => {
  const projectDir = await mkdtemp(
    join(import.meta.dir, "fixtures/native-reject-"),
  );
  try {
    await mkdir(join(projectDir, "src/routes"), { recursive: true });
    await writeFile(
      join(projectDir, "src/routes/index.ts"),
      "export default () => 'ok';",
    );
    const route = { id: "index", path: "/", file: "src/routes/index.ts" };
    await expect(
      buildProjectIsolated({
        projectDir,
        renderer: "native",
        runtime: "vercel-edge",
        programmatic: [{ ...route, mode: "ssr" }],
      }),
    ).rejects.toThrow("only the Bun, Node and Cloudflare runtimes");
    await expect(
      buildProjectIsolated({
        projectDir,
        renderer: "native",
        programmatic: [{ ...route, mode: "island" }],
      }),
    ).rejects.toThrow("hydration is not implemented");
    await expect(
      buildProjectIsolated({
        projectDir,
        renderer: "native",
        programmatic: [{ ...route, mode: "spa" }],
      }),
    ).rejects.toThrow("requires an explicit clientFile");
    await expect(
      buildProjectIsolated({
        projectDir,
        renderer: "native",
        programmatic: [{ ...route, mode: "ssr", clientFile: "src/client.ts" }],
      }),
    ).rejects.toThrow("must use spa mode");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});
