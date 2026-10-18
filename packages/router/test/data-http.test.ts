import { describe, expect, test } from "bun:test";
import { createRouteDataClient } from "../src/data-http";

type Call = { url: string; init: RequestInit };

function envelope(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "x-moonshine-data": "1",
      ...headers,
    },
  });
}

function setup(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as typeof globalThis.fetch;
  const client = createRouteDataClient({
    origin: "https://app.test",
    fetch,
  });
  return { calls, client };
}

const ctx = (location: string, signal = new AbortController().signal) => ({
  location,
  signal,
});

describe("createRouteDataClient", () => {
  test("load sends owned request settings and returns unknown data", async () => {
    const { calls, client } = setup(() => envelope({ data: { a: 1 } }));
    const controller = new AbortController();
    const data = await client.load(ctx("/x?y=1#frag", controller.signal));
    expect(data).toEqual({ a: 1 });
    const call = calls[0]!;
    expect(call.url).toBe("https://app.test/x?y=1");
    expect(call.init.method).toBe("GET");
    expect(call.init.credentials).toBe("same-origin");
    expect(call.init.mode).toBe("same-origin");
    expect(call.init.redirect).toBe("error");
    expect(call.init.signal).toBe(controller.signal);
    expect(new Headers(call.init.headers).get("x-moonshine-data")).toBe("1");
  });

  test("null data is a valid payload", async () => {
    const { client } = setup(() => envelope({ data: null }));
    expect(await client.load(ctx("/"))).toBeNull();
  });

  test("rejects locations outside the origin before fetching", async () => {
    const { calls, client } = setup(() => envelope({ data: 1 }));
    await expect(
      client.load(ctx("https://evil.test/x")),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(client.load(ctx("//evil.test/x"))).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(calls.length).toBe(0);
  });

  test("action keeps body, forces protocol header and owned settings", async () => {
    const { calls, client } = setup(() => envelope({ data: "ok" }));
    const result = await client.action(ctx("/save"), {
      method: "PATCH",
      body: JSON.stringify({ n: 1 }),
      headers: { "content-type": "text/plain", "x-moonshine-data": "9" },
    });
    expect(result).toBe("ok");
    const init = calls[0]!.init;
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"n":1}');
    expect(init.credentials).toBe("same-origin");
    expect(init.mode).toBe("same-origin");
    expect(init.redirect).toBe("error");
    const headers = new Headers(init.headers);
    expect(headers.get("x-moonshine-data")).toBe("1");
    expect(headers.get("content-type")).toBe("text/plain");
  });

  test("action rejects methods outside the allowed set at runtime", async () => {
    const { calls, client } = setup(() => envelope({ data: 1 }));
    for (const method of ["GET", "HEAD", "OPTIONS", ""]) {
      await expect(
        client.action(ctx("/"), { method } as never),
      ).rejects.toBeInstanceOf(TypeError);
    }
    await expect(client.action(ctx("/"), {} as never)).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(calls.length).toBe(0);
  });

  test("non-2xx throws the Response itself", async () => {
    const response = new Response('{"error":"bad"}', { status: 422 });
    const { client } = setup(() => response);
    const thrown = await client.load(ctx("/")).catch((e: unknown) => e);
    expect(thrown).toBe(response);
    expect(await response.json()).toEqual({ error: "bad" });
  });

  test("rejects missing or mismatched version header and cancels body", async () => {
    const variants: Record<string, string>[] = [
      {},
      { "x-moonshine-data": "2" },
    ];
    for (const headers of variants) {
      let cancelled = false;
      const body = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"data":1}'));
        },
        cancel() {
          cancelled = true;
        },
      });
      const { client } = setup(
        () =>
          new Response(body, {
            headers: { "content-type": "application/json", ...headers },
          }),
      );
      await expect(client.load(ctx("/"))).rejects.toBeInstanceOf(TypeError);
      expect(cancelled).toBe(true);
    }
  });

  test("rejects non-JSON content type", async () => {
    const { client } = setup(
      () =>
        new Response('{"data":1}', {
          headers: { "content-type": "text/html", "x-moonshine-data": "1" },
        }),
    );
    await expect(client.load(ctx("/"))).rejects.toBeInstanceOf(TypeError);
  });

  test("accepts JSON content type with parameters", async () => {
    const { client } = setup(
      () =>
        new Response('{"data":2}', {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-moonshine-data": "1",
          },
        }),
    );
    expect(await client.load(ctx("/"))).toBe(2);
  });

  test("rejects invalid envelopes", async () => {
    for (const body of ["{bad", "null", "[]", '"s"', "{}", '{"other":1}']) {
      const { client } = setup(
        () =>
          new Response(body, {
            headers: {
              "content-type": "application/json",
              "x-moonshine-data": "1",
            },
          }),
      );
      await expect(client.load(ctx("/"))).rejects.toBeInstanceOf(TypeError);
    }
  });

  test("inherited data field is not an own field", async () => {
    const { client } = setup(() => envelope({ __proto__: { data: 1 } }));
    await expect(client.load(ctx("/"))).rejects.toBeInstanceOf(TypeError);
  });

  test("abort signal propagates to fetch rejection", async () => {
    const controller = new AbortController();
    const client = createRouteDataClient({
      origin: "https://app.test",
      fetch: ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          );
        })) as typeof globalThis.fetch,
    });
    const pending = client.load(ctx("/", controller.signal));
    controller.abort(new Error("stop"));
    await expect(pending).rejects.toThrow("stop");
  });

  test("validates origin option", () => {
    for (const origin of [
      "app.test",
      "ftp://app.test",
      "https://u:p@app.test",
      "https://app.test/path",
      "https://app.test?q=1",
      "https://app.test#h",
      "",
    ]) {
      expect(() => createRouteDataClient({ origin })).toThrow(TypeError);
    }
    expect(() =>
      createRouteDataClient({ origin: "http://localhost:3000" }),
    ).not.toThrow();
    expect(() =>
      createRouteDataClient({ origin: "https://app.test/" }),
    ).not.toThrow();
  });

  test("requires origin when no browser location exists", () => {
    const location = Object.getOwnPropertyDescriptor(globalThis, "location");
    try {
      Reflect.deleteProperty(globalThis, "location");
      expect(() => createRouteDataClient()).toThrow(TypeError);
    } finally {
      if (location) Object.defineProperty(globalThis, "location", location);
    }
  });
});

test("bodyless protocol successes return null so callers can revalidate", async () => {
  for (const status of [204, 205]) {
    const { client } = setup(
      () =>
        new Response(null, {
          status,
          headers: {
            "content-type": "application/json",
            "x-moonshine-data": "1",
          },
        }),
    );
    expect(await client.action(ctx("/"), { method: "POST" })).toBeNull();
  }
});

test("credential URLs and already aborted calls never reach fetch", async () => {
  const { calls, client } = setup(() => envelope({ data: 1 }));
  await expect(
    client.load(ctx("https://user:pass@app.test/")),
  ).rejects.toBeInstanceOf(TypeError);
  const controller = new AbortController();
  controller.abort(new Error("already stopped"));
  await expect(
    client.action(ctx("/", controller.signal), { method: "POST" }),
  ).rejects.toThrow("already stopped");
  expect(calls).toHaveLength(0);
});

test("malformed responses reject even when stream cancellation never settles", async () => {
  let cancelled = false;
  const { client } = setup(
    () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
            return new Promise<void>(() => {});
          },
        }),
      ),
  );
  await expect(client.load(ctx("/"))).rejects.toThrow(
    "missing x-moonshine-data",
  );
  expect(cancelled).toBe(true);
});

test("body read cancellation keeps its original error", async () => {
  const error = new DOMException("body aborted", "AbortError");
  const { client } = setup(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(error);
          },
        }),
        {
          headers: {
            "content-type": "application/json",
            "x-moonshine-data": "1",
          },
        },
      ),
  );
  await expect(client.load(ctx("/"))).rejects.toBe(error);
});
