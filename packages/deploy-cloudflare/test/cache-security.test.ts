import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  MANIFEST_VERSION,
  type MoonshineManifest,
  type Renderer,
} from "@tschk/moonshine-framework";
import { cloudflareFetch } from "../src/index.js";

const manifest: MoonshineManifest = {
  version: MANIFEST_VERSION,
  frameworkVersion: "0.2.0",
  routes: [
    {
      id: "page",
      path: "/page",
      file: "page.ts",
      mode: "ssr",
      runtime: "cloudflare",
      decision: "fixture",
      clientEntries: [],
      cache: { control: "public, max-age=60" },
    },
  ],
  assets: [],
  entries: {},
  capabilities: [],
};

describe("Cloudflare shared cache security", () => {
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
  let entries: Map<string, Response>;
  let pending: Promise<unknown>[];
  let matches: string[];
  let puts: string[];

  beforeEach(() => {
    entries = new Map();
    pending = [];
    matches = [];
    puts = [];
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        default: {
          match: async (request: Request) => {
            matches.push(request.url);
            return entries.get(request.url)?.clone();
          },
          put: async (request: Request, response: Response) => {
            puts.push(request.url);
            // Workers do not store Set-Cookie or private/no-store responses.
            if (
              response.headers.has("set-cookie") ||
              /(?:private|no-store)/i.test(
                response.headers.get("cache-control") ?? "",
              )
            )
              return;
            await Promise.resolve();
            entries.set(request.url, response.clone());
          },
        },
      },
    });
  });

  afterEach(() => {
    if (originalCaches)
      Object.defineProperty(globalThis, "caches", originalCaches);
    else Reflect.deleteProperty(globalThis, "caches");
  });

  const ctx = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
  };
  const flush = async () => {
    await Promise.all(pending.splice(0));
  };

  for (const header of ["cookie", "authorization", "x-visitor"] as const) {
    test(`${header} visitors cannot populate or read another visitor's cache entry`, async () => {
      let renders = 0;
      const renderer: Renderer = {
        name: "visitor",
        render: async ({ request }) =>
          new Response(request.headers.get(header), {
            headers: {
              "cache-control": "public, max-age=60",
              "x-render": String(++renders),
            },
          }),
        prerender: async () => "",
      };
      const first = await cloudflareFetch(
        new Request("https://example.test/page", {
          headers: {
            [header]: header === "cookie" ? "session=alice" : "visitor-alice",
          },
        }),
        {},
        ctx,
        manifest,
        {},
        renderer,
      );
      await flush();
      const second = await cloudflareFetch(
        new Request("https://example.test/page", {
          headers: {
            [header]: header === "cookie" ? "session=bob" : "visitor-bob",
          },
        }),
        {},
        ctx,
        manifest,
        {},
        renderer,
      );
      await flush();
      expect(await first.text()).toBe(
        header === "cookie" ? "session=alice" : "visitor-alice",
      );
      expect(await second.text()).toBe(
        header === "cookie" ? "session=bob" : "visitor-bob",
      );
      expect(first.headers.get("cache-control")).toBe("private, no-store");
      expect(second.headers.get("cache-control")).toBe("private, no-store");
      expect(renders).toBe(2);
      expect(matches).toEqual([]);
      expect(puts).toEqual([]);
      expect(entries.size).toBe(0);
    });
  }

  test("ignores an existing entry for a personalized header without credentials", async () => {
    entries.set("https://example.test/page", new Response("stale visitor"));
    const renderer: Renderer = {
      name: "personalized",
      render: async ({ request }) =>
        new Response(request.headers.get("x-visitor"), {
          headers: { "cache-control": "public, max-age=60" },
        }),
      prerender: async () => "",
    };
    const response = await cloudflareFetch(
      new Request("https://example.test/page", {
        headers: { "x-visitor": "visitor-bob" },
      }),
      {},
      ctx,
      manifest,
      {},
      renderer,
    );
    await flush();
    expect(await response.text()).toBe("visitor-bob");
    expect(matches).toEqual([]);
    expect(puts).toEqual([]);
  });

  test("authorization middleware runs before a pre-existing cache hit", async () => {
    entries.set(
      "https://example.test/page",
      new Response("Alice's private page", {
        headers: { "cache-control": "public, max-age=60" },
      }),
    );
    let checked = 0;
    const modules = {
      page: {
        before: [
          async () => {
            checked++;
            return new Response("Forbidden", { status: 403 });
          },
        ],
      },
    };
    const renderer: Renderer = {
      name: "unused",
      render: async () => new Response("rendered"),
      prerender: async () => "",
    };
    const response = await cloudflareFetch(
      new Request("https://example.test/page"),
      {},
      ctx,
      manifest,
      modules,
      renderer,
    );
    await flush();
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    expect(checked).toBe(1);
    expect(matches).toEqual([]);
    expect(puts).toEqual([]);
  });

  const sensitiveHeaders: Record<string, string>[] = [
    { "cache-control": "private, max-age=60" },
    { "cache-control": "no-store" },
    {
      "set-cookie": "session=alice; Path=/",
      "cache-control": "public, max-age=60",
    },
    { vary: "Accept-Language", "cache-control": "public, max-age=60" },
  ];
  for (const headers of sensitiveHeaders) {
    test(`does not put sensitive response headers ${JSON.stringify(headers)} in shared cache`, async () => {
      let renders = 0;
      const renderer: Renderer = {
        name: "sensitive",
        render: async () => new Response(`visitor ${++renders}`, { headers }),
        prerender: async () => "",
      };
      const first = await cloudflareFetch(
        new Request("https://example.test/page"),
        {},
        ctx,
        manifest,
        {},
        renderer,
      );
      await flush();
      const second = await cloudflareFetch(
        new Request("https://example.test/page"),
        {},
        ctx,
        manifest,
        {},
        renderer,
      );
      await flush();
      expect(await first.text()).toBe("visitor 1");
      expect(await second.text()).toBe("visitor 2");
      expect(first.headers.get("cache-control")).toBe("private, no-store");
      expect(matches).toEqual([]);
      expect(puts).toEqual([]);
    });
  }

  test("configured public routes do not use implicit shared caching", async () => {
    let renders = 0;
    const renderer: Renderer = {
      name: "public",
      render: async () =>
        new Response(`public ${++renders}`, {
          headers: { "cache-control": "public, max-age=60" },
        }),
      prerender: async () => "",
    };
    const request = (query: string) =>
      new Request(`https://example.test/page?${query}`);
    const first = await cloudflareFetch(
      request("a=1"),
      {},
      ctx,
      manifest,
      {},
      renderer,
    );
    await flush();
    const second = await cloudflareFetch(
      request("a=1"),
      {},
      ctx,
      manifest,
      {},
      renderer,
    );
    const otherUrl = await cloudflareFetch(
      request("a=2"),
      {},
      ctx,
      manifest,
      {},
      renderer,
    );
    await flush();
    expect(await first.text()).toBe("public 1");
    expect(await second.text()).toBe("public 2");
    expect(await otherUrl.text()).toBe("public 3");
    expect(matches).toEqual([]);
    expect(puts).toEqual([]);
    expect(entries.size).toBe(0);
  });
});
