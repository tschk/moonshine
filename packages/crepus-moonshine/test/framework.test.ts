import { describe, expect, test } from "bun:test";
import type { CrepusIr } from "../src/types";
import { crepusRenderer } from "../src/index";
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

function allKindsIr(): CrepusIr {
  return {
    version: 1,
    root: [
      {
        kind: "stack",
        children: [
          { kind: "text", content: "Hello" },
          {
            kind: "scroll",
            children: [{ kind: "text", content: "scrolled" }],
          },
          { kind: "button", label: "Click", onClick: "doThing" },
          { kind: "toggle", label: "Dark", value: true, onChange: "setDark" },
          { kind: "checkbox", label: "Agree", value: false },
          { kind: "progress", value: 0.4, max: 1 },
          { kind: "meter", value: 0.6, min: 0, max: 1 },
          { kind: "sparkline", values: [1, 2, 3], width: 40, height: 10 },
          { kind: "badge", label: "NEW", tone: "accent" },
          { kind: "divider" },
          { kind: "spacer", size: 12 },
          { kind: "image", src: "/x.png", alt: "x" },
          {
            kind: "if",
            condition: true,
            then: [{ kind: "text", content: "yes" }],
            else: [{ kind: "text", content: "no" }],
          },
          {
            kind: "forEach",
            items: [1, 2],
            itemTemplate: { kind: "badge", label: "item" },
          },
          {
            kind: "list",
            children: [
              { kind: "listItem", label: "One" },
              { kind: "listItem", label: "Two" },
            ],
          },
        ],
      },
    ],
  };
}

describe("crepus renderer", () => {
  test("prerender renders all documented View IR kinds", async () => {
    const html = await crepusRenderer.prerender(
      makeContext(makeRoute({ mode: "static" }), allKindsIr()),
    );
    expect(html).toContain("<!DOCTYPE html>");
    for (const kind of [
      "text",
      "stack",
      "scroll",
      "button",
      "toggle",
      "checkbox",
      "progress",
      "meter",
      "sparkline",
      "badge",
      "divider",
      "spacer",
      "image",
      "if",
      "forEach",
      "list",
      "listItem",
    ]) {
      expect(html).toContain(`data-crepus-kind="${kind}"`);
    }
    expect(html).toContain("scrolled");
    expect(html).toContain("yes");
    expect(html).toContain("One");
    expect(html).not.toContain(">no<");
  });

  test("render returns an HTML response with all IR kinds", async () => {
    const res = await crepusRenderer.render(
      makeContext(makeRoute({ mode: "ssr" }), allKindsIr()),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.body).toBeInstanceOf(ReadableStream);
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
    expect(text).toContain('data-crepus-kind="sparkline"');
    expect(text).toContain("scrolled");
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
