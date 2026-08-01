import { describe, expect, test } from "bun:test";
import type { RouteArtifact } from "@tschk/moonshine-framework";
import { GET } from "../src/routes/api/state.server";
import * as home from "../src/routes/index";
import * as packagesRoute from "../src/routes/packages";
import { createSiteRenderer } from "../src/renderer";
import { PACKAGES } from "../src/packages";
import { jsonForScript } from "../src/edge";

function artifact(id: string, path: string): RouteArtifact {
  return {
    id,
    path,
    file: id,
    mode: "ssr",
    runtime: "cloudflare",
    decision: "test",
    clientEntries: [],
  };
}

async function renderRoute(
  id: string,
  path: string,
  module: unknown,
): Promise<string> {
  const request = new Request(`https://moonshine.tsc.hk${path}`);
  const loader = (module as { loader: (ctx: { request: Request }) => unknown })
    .loader;
  const data = await loader({ request });
  const renderer = createSiteRenderer({
    [id]: module as { default?: unknown },
  });
  const response = await renderer.render({
    request,
    route: artifact(id, path),
    params: {},
    data: { [id]: data },
    signal: request.signal,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  return response.text();
}

describe("api route", () => {
  test("returns a real JSON body, not an empty object", async () => {
    const response = await GET(
      new Request("https://moonshine.tsc.hk/api/state"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).length).toBeGreaterThan(0);
    expect(body.site).toBe("moonshine.tsc.hk");
    expect(body.runtime).toBe("cloudflare");
    expect(body.kernelBytesMinified).toBe(2985);
    expect(Array.isArray(body.packages)).toBe(true);
    expect((body.packages as unknown[]).length).toBe(PACKAGES.length);
  });

  test("edge facts change between requests", async () => {
    const first = (await (
      await GET(new Request("https://moonshine.tsc.hk/api/state"))
    ).json()) as { edge: { isolateRequests: number; renderNonce: string } };
    const second = (await (
      await GET(new Request("https://moonshine.tsc.hk/api/state"))
    ).json()) as { edge: { isolateRequests: number; renderNonce: string } };
    expect(second.edge.isolateRequests).toBe(first.edge.isolateRequests + 1);
    expect(second.edge.renderNonce).not.toBe(first.edge.renderNonce);
  });
});

describe("document shell", () => {
  test("the home page renders a complete document", async () => {
    const html = await renderRoute("index", "/", home);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain(
      "<title>moonshine — a hyperminimal Bun-first UI runtime</title>",
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://moonshine.tsc.hk/">',
    );
    expect(html).toContain("built with crepuscularity + moonshine");
    expect(html).toContain('data-island="signal-graph"');
    expect(html).toContain('<script type="module" src="/client.js"></script>');
    expect(html).toContain('<main id="main">');
  });

  test("the packages page lists every package", async () => {
    const html = await renderRoute("packages", "/packages", packagesRoute);
    for (const entry of PACKAGES) {
      expect(html).toContain(entry.name);
    }
    expect(html).toContain("built with crepuscularity + moonshine");
  });
});

describe("island props", () => {
  test("serialized props escape characters that would close the script", () => {
    expect(jsonForScript({ seed: 3 })).toBe('{"seed":3}');
    expect(jsonForScript({ s: "</script>" })).not.toContain("</script>");
  });
});
