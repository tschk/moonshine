import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Renderer, RouteArtifact } from "@tschk/moonshine-framework";
import { buildProjectIsolated } from "./build-in-subprocess";

/**
 * Interactive React routes must come alive in the browser: the client entry
 * `moonshine build` emits has to load and hydrate each `island()` the server
 * rendered, and hydrate a whole route declared with `hydrate: "route"`.
 */

// Inside the monorepo so `react` resolves at build time.
const projectDir = join(import.meta.dir, `.tmp-react-hydration-${process.pid}`);

afterAll(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

const counter = (label: string) => `import { useState } from "react";
export default function Counter({ start }: { start: number }) {
  const [count, setCount] = useState(start);
  return <button onClick={() => setCount(count + 1)}>${label} {count}</button>;
}
`;

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
}

test("the client entry hydrates islands and route-hydrated pages, and navigates in place", async () => {
  const routes = join(projectDir, "src", "routes");
  const components = join(projectDir, "src", "components");
  mkdirSync(routes, { recursive: true });
  mkdirSync(components, { recursive: true });
  writeFileSync(join(components, "Counter.tsx"), counter("island"));
  writeFileSync(
    join(routes, "+layout.tsx"),
    `import type { ReactNode } from "react";
import { Link } from "@tschk/moonshine/router";
export default function Layout({ children }: { children: ReactNode }) {
  return <main><Link href="/other">other</Link>{children}</main>;
}
`,
  );
  writeFileSync(
    join(routes, "island.tsx"),
    `import { island } from "@tschk/moonshine-react";
const Counter = island(() => import("../components/Counter"));
export default function Page() {
  return <Counter start={1} />;
}
`,
  );
  writeFileSync(
    join(routes, "whole.tsx"),
    counter("route")
      .replace(
        "{ start }: { start: number }",
        "{ data }: { data: { start: number } }",
      )
      .replace("useState(start)", "useState(data.start)"),
  );
  writeFileSync(
    join(routes, "whole.data.ts"),
    "export function loader() { return { start: 5 }; }\n",
  );

  writeFileSync(
    join(routes, "other.tsx"),
    "export default function Other() { return <h1>other</h1>; }\n",
  );

  await buildProjectIsolated({
    projectDir,
    runtime: "node",
    programmatic: [
      {
        id: "whole",
        path: "/whole",
        file: "src/routes/whole.tsx",
        hydrate: "route",
      },
      {
        id: "other",
        path: "/other",
        file: "src/routes/other.tsx",
        hydrate: "route",
      },
    ],
  });
  const out = join(projectDir, ".moonshine");
  const bundle = (await import(join(out, "dist", "server.js"))) as {
    renderer: Renderer;
  };
  const manifest = await Bun.file(join(out, "manifest.json")).json();

  const page = async (path: string, data: unknown) => {
    const route = manifest.routes.find(
      (candidate: RouteArtifact) => candidate.path === path,
    ) as RouteArtifact;
    expect(route.clientEntries).toEqual(["/client.js"]);
    const response = await bundle.renderer.render({
      request: new Request(`http://localhost${path}`),
      route,
      params: {},
      data,
      signal: new AbortController().signal,
    });
    return response.text();
  };
  const islandHtml = await page("/island", {});
  const wholeHtml = await page("/whole", { start: 5 });
  // Only the client entry is preloaded: the island ships inside it.
  expect(islandHtml.match(/rel="modulepreload"/g)).toEqual([
    'rel="modulepreload"',
  ]);
  expect(wholeHtml).toContain("data-moonshine-route-props");

  await import("../../react/test/dom");
  const act = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  act.IS_REACT_ACT_ENVIRONMENT = false;
  const client = join(out, "public", "client.js");
  try {
    for (const [path, html, label, start] of [
      ["/island", islandHtml, "island", 1],
      ["/whole", wholeHtml, "route", 5],
    ] as const) {
      history.replaceState(null, "", path);
      // The test imports the entry itself; happy-dom cannot fetch scripts.
      document.body.innerHTML = html
        .slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
        .replace(/<script type="module"[^>]*><\/script>/g, "");
      const button = () => document.querySelector("button")!;
      expect(button().textContent).toBe(`${label} ${start}`);
      // A fresh module instance per page, as each page load would have.
      await import(`${client}?${label}`);
      await waitFor(() =>
        Object.keys(button()).some((key) => key.startsWith("__reactFiber")),
      );
      button().click();
      await waitFor(() => button().textContent !== `${label} ${start}`);
      expect(button().textContent).toBe(`${label} ${start + 1}`);
    }

    // The /whole page stays mounted: its layout's Link renders /other in
    // place, and Back renders /whole again, without loading a document.
    const realFetch = globalThis.fetch;
    const fetched: string[] = [];
    globalThis.fetch = (async (input: string | URL) => {
      const { pathname } = new URL(String(input));
      fetched.push(pathname);
      const data = pathname === "/whole" ? { start: 5 } : {};
      return new Response(await page(pathname, data), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }) as typeof fetch;
    try {
      const link = document.querySelector("main > a")!;
      (link as HTMLAnchorElement).click();
      await waitFor(() => document.querySelector("h1") !== null);
      expect(document.querySelector("h1")?.textContent).toBe("other");
      expect(document.querySelector("button")).toBeNull();
      expect(window.location.pathname).toBe("/other");
      expect(document.querySelector("main > a")).toBe(link);

      history.back();
      await waitFor(() => document.querySelector("button") !== null);
      expect(document.querySelector("button")?.textContent).toBe("route 5");
      expect(window.location.pathname).toBe("/whole");
      expect(fetched).toEqual(["/other", "/whole"]);
    } finally {
      globalThis.fetch = realFetch;
    }
  } finally {
    act.IS_REACT_ACT_ENVIRONMENT = true;
    document.body.replaceChildren();
  }
}, 60_000);
