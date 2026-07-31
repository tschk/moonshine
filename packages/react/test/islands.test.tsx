import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createElement } from "react";
import { island, IslandProvider, type IslandRegistry } from "../src/islands";
import { reactRenderer } from "../src/renderer";
import type { RenderContext, RouteArtifact } from "@tschk/moonshine-framework";

const fixtures = join(import.meta.dir, "fixtures");

function makeRoute(
  overrides: Partial<RouteArtifact> & { mode: RouteArtifact["mode"] },
): RouteArtifact {
  return {
    id: "home",
    path: "/",
    file: join(fixtures, "Home.tsx"),
    runtime: "bun",
    decision: "test",
    clientEntries: [],
    ...overrides,
  };
}

function makeContext(
  route: RouteArtifact,
  overrides?: Partial<RenderContext>,
): RenderContext {
  return {
    request: new Request(`http://localhost${route.path}`),
    route,
    params: {},
    data: {},
    signal: new AbortController().signal,
    ...overrides,
  };
}

async function renderIsland(
  el: ReturnType<typeof createElement>,
): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server");
  const registry: IslandRegistry = { entries: new Map() };
  const stream = await renderToReadableStream(
    createElement(IslandProvider, { registry }, el),
  );
  await stream.allReady;
  return new Response(stream).text();
}

function extractIslandId(html: string): string | null {
  const match = html.match(/data-moonshine-island="([^"]+)"/);
  return match ? match[1]! : null;
}

describe("react islands", () => {
  test("island produces a stable data-moonshine-island ID", async () => {
    const Counter = island(() => import("./fixtures/Counter"));
    const a = await renderIsland(createElement(Counter, { start: 1 }));
    const b = await renderIsland(createElement(Counter, { start: 2 }));
    const idA = extractIslandId(a);
    const idB = extractIslandId(b);
    expect(idA).toBeTruthy();
    expect(idA).toBe(idB);
  });

  test("island serializes escaped JSON props", async () => {
    const Counter = island(() => import("./fixtures/Counter"));
    const text = "<script>alert('&')\u2028\u2029";
    const html = await renderIsland(createElement(Counter, { start: 5, text }));
    const scriptMatch = html.match(
      /<script type="application\/json" data-moonshine-island-props="[^"]+">([\s\S]*?)<\/script>/,
    );
    expect(scriptMatch).toBeTruthy();
    const encoded = scriptMatch![1]!;
    expect(encoded).toContain("\\u003c");
    expect(encoded).toContain("\\u003e");
    expect(encoded).toContain("\\u0026");
    expect(encoded).toContain("\\u2028");
    expect(encoded).toContain("\\u2029");
    const parsed = JSON.parse(encoded);
    expect(parsed.text).toBe(text);
  });

  test("island mode emits one modulepreload per shared entry", async () => {
    const res = await reactRenderer.render(
      makeContext(
        makeRoute({
          mode: "island",
          file: join(fixtures, "IslandPage2.tsx"),
          clientEntries: ["/client.js"],
        }),
        { data: { start: 1, name: "Moon" } },
      ),
    );
    const html = await res.text();
    expect(html).toContain('<link rel="modulepreload" href="/client.js">');
    expect(html).toContain('<link rel="modulepreload" href="./Counter">');
    expect(html).toContain('<link rel="modulepreload" href="./Greet">');
    expect(html).toContain('<script type="module" src="/client.js"></script>');
    expect(html).toContain(
      '<script type="application/json" data-moonshine-island-modules>',
    );
    const modulePreloads = html.match(/<link rel="modulepreload"/g) ?? [];
    expect(modulePreloads.length).toBe(3);
  });

  test("island mode omits hydration script when zero islands", async () => {
    const res = await reactRenderer.render(
      makeContext(
        makeRoute({
          mode: "island",
          file: join(fixtures, "Home.tsx"),
          clientEntries: ["/client.js"],
        }),
      ),
    );
    const html = await res.text();
    expect(html).not.toContain("/client.js");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("modulepreload");
  });
});
