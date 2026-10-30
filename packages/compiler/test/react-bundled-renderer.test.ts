import { afterAll, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Renderer, RouteArtifact } from "@tschk/moonshine-framework";
import { buildProjectIsolated } from "./build-in-subprocess";

/**
 * A React server bundle must render on its own. Its renderer has to come from
 * the bundle: one imported from the `@tschk/moonshine-react` package loads
 * pages from their source paths (absent once deployed), runs a second React
 * next to the bundle's own (hooks throw "Invalid hook call"), and sees
 * different CSS module class names than the client bundle.
 */

// Inside the monorepo so `react` resolves at build time.
const projectDir = join(
  import.meta.dir,
  `.tmp-bundled-renderer-${process.pid}`,
);
const deployed = mkdtempSync(join(tmpdir(), "moonshine-deployed-"));

afterAll(() => {
  rmSync(projectDir, { recursive: true, force: true });
  rmSync(deployed, { recursive: true, force: true });
});

test("the server bundle exports a renderer that works without the source tree", async () => {
  const routes = join(projectDir, "src", "routes");
  mkdirSync(routes, { recursive: true });
  writeFileSync(
    join(routes, "+layout.tsx"),
    `import { useId, type ReactNode } from "react";
export default function Layout({ children }: { children: ReactNode }) {
  return <div data-layout={useId()}>{children}</div>;
}
`,
  );
  writeFileSync(join(routes, "page.module.css"), ".title { color: red; }\n");
  writeFileSync(
    join(routes, "index.tsx"),
    `import { useState } from "react";
import styles from "./page.module.css";
export default function Home() {
  const [label] = useState("bundled");
  return <h1 className={styles.title}>{label}</h1>;
}
`,
  );

  await buildProjectIsolated({ projectDir, runtime: "node" });
  const out = join(deployed, ".moonshine");
  renameSync(join(projectDir, ".moonshine"), out);
  rmSync(projectDir, { recursive: true, force: true });

  const bundle = (await import(join(out, "dist", "server.js"))) as {
    renderer?: Renderer;
  };
  expect(bundle.renderer?.name).toBe("react");

  const manifest = await Bun.file(join(out, "manifest.json")).json();
  const route = manifest.routes.find(
    (candidate: RouteArtifact) => candidate.path === "/",
  ) as RouteArtifact;
  const response = await bundle.renderer!.render({
    request: new Request("http://localhost/"),
    route,
    params: {},
    data: {},
    signal: new AbortController().signal,
  });
  const html = await response.text();
  expect(html).toMatch(
    /<div data-layout="[^"]+"><h1 class="title_[\w-]+">bundled<\/h1><\/div>/,
  );
}, 60_000);
