import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequestHandler } from "@tschk/moonshine-server";
import { buildProjectIsolated } from "./build-in-subprocess";
import { readManifest } from "../src/manifest";

test("native SSR/static CSS stays route-specific, ordered and public without private JS", async () => {
  // macOS temp paths exercise Bun's canonical /private/var metadata paths.
  const project = await mkdtemp(join(tmpdir(), "moonshine-server-css-"));
  try {
    await mkdir(join(project, "src/routes"), { recursive: true });
    await mkdir(join(project, "node_modules/@tschk"), { recursive: true });
    await symlink(
      resolve(import.meta.dir, "../../dom"),
      join(project, "node_modules/@tschk/moonshine-dom"),
    );
    const sources = {
      "shared.ts":
        'import "./shared.css"; export const shared = "PRIVATE_SHARED_JS";',
      "shared.css":
        '.shared-rule { color: black; background: url("./shared.bin"); }',
      "shared.bin": "shared-asset".repeat(8192),
      "layout.ts": `import { h } from "@tschk/moonshine-dom/ssr";
        import "./shared"; export default props => h("main", null, props.children);`,
      "data.ts": `import "./data.css"; export const loader = () => ({ secret: "PRIVATE_DATA_JS" });`,
      "data.css": ".data-rule { color: gray; }",
      "alpha.ts": `import { h } from "@tschk/moonshine-dom/ssr";
        import "./shared"; import "./alpha.css";
        export const lazy = () => import("./lazy");
        export const secret = "PRIVATE_ALPHA_JS";
        export default () => h("p", null, "alpha");`,
      "alpha.css":
        '@import "./nested.css" layer(theme) screen; .alpha-rule { color: red; background: url("./icon.svg"); }',
      "nested.css": ".nested-rule { color: green; }",
      "lazy.ts": 'import "./lazy.css"; export default "PRIVATE_LAZY_JS";',
      "lazy.css": ".lazy-rule { color: purple; }",
      "beta.ts": `import { h } from "@tschk/moonshine-dom/ssr";
        import "./beta.css"; export const secret = "PRIVATE_BETA_JS";
        export default () => h("p", null, "beta");`,
      "beta.css": ".beta-rule { color: blue; }",
      "icon.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
    };
    for (const [file, source] of Object.entries(sources))
      await Bun.write(join(project, "src", file), source);
    await buildProjectIsolated({
      projectDir: project,
      renderer: "native",
      programmatic: [
        {
          id: "__proto__",
          path: "/alpha",
          file: "src/alpha.ts",
          mode: "ssr",
          layouts: ["src/layout.ts"],
          dataFile: "src/data.ts",
        },
        {
          id: "beta",
          path: "/beta",
          file: "src/beta.ts",
          mode: "static",
          layouts: ["src/layout.ts"],
        },
      ],
    });
    const out = join(project, ".moonshine");
    const manifest = await readManifest(join(out, "manifest.json"));
    const bundle = await import(join(out, "dist/server.js"));
    const handler = createRequestHandler({
      manifest,
      modules: bundle.modules,
      renderer: bundle.renderer,
      staticDir: join(out, "public"),
    });
    const styles = new Map<string, string>();
    for (const route of manifest.routes) {
      expect(route.clientEntries).toEqual([]);
      expect(route.clientStyles).toHaveLength(1);
      const asset = manifest.assets.find(
        (candidate) => candidate.path === route.clientStyles![0],
      );
      expect(asset!.file).toStartWith("public/");
      expect(asset!.integrity).toStartWith("sha256-");
      const css = await Bun.file(join(out, asset!.file)).text();
      styles.set(route.path, css);
      expect(css).toContain(".shared-rule");
      expect(css).not.toContain("PRIVATE_");
      expect(css).not.toContain(await realpath(project));
      const response = await handler(new Request(`http://test${route.path}`));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(
        `<link rel="stylesheet" href="${route.clientStyles![0]}">`,
      );
      expect(html).not.toContain('type="module"');
    }
    const alpha = styles.get("/alpha")!;
    const beta = styles.get("/beta")!;
    expect(alpha).toContain(".alpha-rule");
    expect(alpha).toContain(".data-rule");
    expect(alpha).toContain(".lazy-rule");
    expect(alpha).toContain("@media screen");
    expect(alpha).toContain("@layer theme");
    expect(alpha).toContain("data:image/svg+xml;base64,");
    expect(alpha).not.toContain(".beta-rule");
    expect(alpha.indexOf(".shared-rule")).toBeLessThan(
      alpha.indexOf(".data-rule"),
    );
    expect(alpha.indexOf(".data-rule")).toBeLessThan(
      alpha.indexOf(".alpha-rule"),
    );
    expect(alpha.indexOf(".nested-rule")).toBeLessThan(
      alpha.indexOf(".alpha-rule"),
    );
    expect(alpha.match(/\.shared-rule/g)).toHaveLength(1);
    expect(beta).toContain(".beta-rule");
    expect(beta).not.toContain(".alpha-rule");
    expect(beta).not.toContain(".lazy-rule");
    const sharedURL = `data:application/octet-stream;base64,${Buffer.from(sources["shared.bin"]).toString("base64")}`;
    expect(alpha.split(sharedURL)).toHaveLength(2);
    expect(beta.split(sharedURL)).toHaveLength(2);
    expect(new Set(manifest.assets.map((asset) => asset.path)).size).toBe(
      manifest.assets.length,
    );
    const files = await Array.fromAsync(
      new Bun.Glob("**/*").scan({ cwd: join(out, "public"), onlyFiles: true }),
    );
    expect(files.every((file) => !/\.[cm]?js$/.test(file))).toBe(true);
    for (const file of files)
      expect(
        manifest.assets.some(
          (asset) => resolve(out, asset.file) === join(out, "public", file),
        ),
      ).toBe(true);

    // A SPA with server and client CSS gets one unified link, not two shared cascades.
    await Bun.write(
      join(project, "src/gamma.ts"),
      `import "./gamma.css";
      export const secret = "PRIVATE_GAMMA_JS";
      export default function Page() { throw Error("SPA must not render server component"); }`,
    );
    await Bun.write(
      join(project, "src/gamma.css"),
      ".gamma-server-rule { color: red; }",
    );
    await Bun.write(
      join(project, "src/gamma-client.css"),
      ".gamma-client-rule { color: green; }",
    );
    await Bun.write(
      join(project, "src/gamma-client.ts"),
      `import "./shared.css"; import "./gamma-client.css";
      export default () => "gamma";`,
    );
    await buildProjectIsolated({
      projectDir: project,
      renderer: "native",
      programmatic: [
        {
          id: "gamma",
          path: "/gamma",
          file: "src/gamma.ts",
          mode: "spa",
          clientFile: "src/gamma-client.ts",
          layouts: ["src/layout.ts"],
        },
      ],
    });
    const spa = await readManifest(join(out, "manifest.json"));
    const gamma = spa.routes[0]!;
    expect(gamma.clientEntries).toHaveLength(1);
    expect(gamma.clientStyles).toHaveLength(1);
    const sheet = spa.assets.find(
      (asset) => asset.path === gamma.clientStyles![0],
    )!;
    const css = await Bun.file(join(out, sheet.file)).text();
    expect(css.match(/\.shared-rule/g)).toHaveLength(1);
    expect(css.indexOf(".shared-rule")).toBeLessThan(
      css.indexOf(".gamma-server-rule"),
    );
    expect(css.indexOf(".gamma-server-rule")).toBeLessThan(
      css.indexOf(".gamma-client-rule"),
    );
    for (const asset of spa.assets.filter((candidate) =>
      candidate.file.startsWith("public/"),
    )) {
      expect(await Bun.file(join(out, asset.file)).text()).not.toContain(
        "PRIVATE_",
      );
    }
    await Bun.write(
      join(project, "src/gamma-client.ts"),
      `import { secret } from "./gamma"; export default () => secret;`,
    );
    await expect(
      buildProjectIsolated({
        projectDir: project,
        renderer: "native",
        programmatic: [
          {
            id: "gamma",
            path: "/gamma",
            file: "src/gamma.ts",
            mode: "spa",
            clientFile: "src/gamma-client.ts",
            layouts: ["src/layout.ts"],
          },
        ],
      }),
    ).rejects.toThrow("server-only route module");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}, 30_000);
