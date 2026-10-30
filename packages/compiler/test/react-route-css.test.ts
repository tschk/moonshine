import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Renderer, RouteArtifact } from "@tschk/moonshine-framework";
import { buildProjectIsolated } from "./build-in-subprocess";

/**
 * CSS imported by server-rendered React routes must reach the browser: it is
 * published per route and linked from the document. Root-relative url()s in
 * that CSS name public files and must survive the build untouched.
 */

// Inside the monorepo so `react` resolves at build time.
const projectDir = join(import.meta.dir, `.tmp-react-route-css-${process.pid}`);

afterAll(() => rmSync(projectDir, { recursive: true, force: true }));

test("React routes link the CSS they import, keeping public url()s", async () => {
  const routes = join(projectDir, "src", "routes");
  mkdirSync(routes, { recursive: true });
  mkdirSync(join(projectDir, "public", "fonts"), { recursive: true });
  writeFileSync(join(projectDir, "public", "fonts", "brand.woff2"), "font");
  writeFileSync(
    join(routes, "global.css"),
    "@font-face { font-family: Brand; src: url(/fonts/brand.woff2); }\n",
  );
  writeFileSync(join(routes, "page.module.css"), ".title { color: red; }\n");
  writeFileSync(
    join(routes, "+layout.tsx"),
    `import "./global.css";
export default function Layout({ children }: { children: unknown }) { return <>{children}</>; }
`,
  );
  writeFileSync(
    join(routes, "index.tsx"),
    `import styles from "./page.module.css";
export default function Home() { return <h1 className={styles.title}>home</h1>; }
`,
  );
  writeFileSync(
    join(routes, "plain.tsx"),
    `export default function Plain() { return <p>plain</p>; }\n`,
  );

  await buildProjectIsolated({ projectDir });
  const out = join(projectDir, ".moonshine");
  const manifest = await Bun.file(join(out, "manifest.json")).json();
  const { renderer } = (await import(join(out, "dist", "server.js"))) as {
    renderer: Renderer;
  };
  const render = async (path: string) => {
    const route = manifest.routes.find(
      (candidate: RouteArtifact) => candidate.path === path,
    ) as RouteArtifact;
    const html = await renderer.prerender({
      request: new Request(`http://localhost${path}`),
      route,
      params: {},
      data: {},
      signal: new AbortController().signal,
    });
    const hrefs = [
      ...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g),
    ].map((match) => match[1]!);
    const css = (
      await Promise.all(
        hrefs.map((href) => Bun.file(join(out, "public", href)).text()),
      )
    ).join("\n");
    return { html, css };
  };

  const home = await render("/");
  const className = /<h1 class="([^"]+)">/.exec(home.html)![1]!;
  expect(home.css).toContain(`.${className}`);
  expect(home.css).toContain("url(/fonts/brand.woff2)");

  // The layout's CSS applies to every page under it.
  const plain = await render("/plain");
  expect(plain.css).toContain("url(/fonts/brand.woff2)");
  expect(plain.css).not.toContain(`.${className}`);
}, 60_000);
