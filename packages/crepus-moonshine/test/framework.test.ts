import { describe, expect, test } from "bun:test";
import type { CrepusIr } from "../src/index";
import { crepusRenderer, parseCrepus } from "../src/index";
import type { RenderContext, RouteArtifact } from "@tschk/moonshine-framework";

function makeRoute(
  overrides?: Partial<RouteArtifact> & { mode?: RouteArtifact["mode"] },
): RouteArtifact {
  return {
    id: "demo",
    path: "/",
    file: "demo.tsx",
    runtime: "bun",
    mode: "static",
    decision: "test",
    clientEntries: [],
    ...overrides,
  };
}

function makeContext(
  route: RouteArtifact,
  data?: unknown,
  overrides?: Partial<RenderContext>,
): RenderContext {
  return {
    request: new Request(`http://localhost${route.path}`),
    route,
    params: {},
    data: data ?? {},
    signal: new AbortController().signal,
    ...overrides,
  };
}

const SOURCE = `div flex flex-col gap-4 text-zinc-100
  span text-lg
    "Hello"
  a href="https://example.com" no-underline
    span
      "crepuscularity"
  button
    "Click"
  ul
    li
      "One"
    li
      "Two"
  img src="/x.png" alt="x"
  hr
`;

function allKindsIr(): CrepusIr {
  return parseCrepus(SOURCE);
}

describe("crepus renderer", () => {
  test("prerender renders IR to real html elements with classes", async () => {
    const html = await crepusRenderer.prerender(
      makeContext(makeRoute({ mode: "static" }), allKindsIr()),
    );
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('class="flex flex-col gap-4 text-zinc-100"');
    expect(html).toContain(
      '<a class="no-underline" href="https://example.com"',
    );
    expect(html).toContain('<button type="button"');
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain('<img src="/x.png"');
    expect(html).toContain("<hr");
    expect(html).toContain("Hello");
    expect(html).toContain("One");
    // Classes are the styling channel; hints must not leak as inline CSS.
    expect(html).not.toContain("style=");
  });

  test("render accepts raw .crepus source as route data", async () => {
    const res = await crepusRenderer.render(
      makeContext(makeRoute({ mode: "ssr" }), SOURCE),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
    expect(text).toContain('class="flex flex-col gap-4 text-zinc-100"');
    expect(text).toContain("crepuscularity");
  });

  test("render returns an HTML response from parsed IR", async () => {
    const res = await crepusRenderer.render(
      makeContext(makeRoute({ mode: "ssr" }), allKindsIr()),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.body).toBeInstanceOf(ReadableStream);
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
    expect(text).toContain("Hello");
  });

  test("render api route does not render IR", async () => {
    const res = await crepusRenderer.render(
      makeContext(makeRoute({ mode: "api" }), { ok: true }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });

  test("render spa route returns a shell with client script", async () => {
    const res = await crepusRenderer.render(
      makeContext(makeRoute({ mode: "spa", clientEntries: ["/client.js"] }), {
        ok: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
    expect(text).toContain("/client.js");
    expect(text).toContain("<script");
    expect(text).toContain("moonshine-app");
  });
});
