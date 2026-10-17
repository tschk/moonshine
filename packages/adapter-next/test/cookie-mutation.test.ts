import { describe, expect, test } from "bun:test";
import { cookies, runWithRequest } from "../src/headers";
import { createRequestHandler, redirect } from "../../server/src";

const url = "https://example.com/page";

function scope<T>(fn: (sink: Headers) => T, cookie?: string): T {
  const sink = new Headers();
  const request = new Request(url, cookie ? { headers: { cookie } } : {});
  return runWithRequest(request, () => fn(sink), sink);
}

function set(sink: Headers): string[] {
  return sink.getSetCookie();
}

describe("cookies() mutation", () => {
  test("set(name, value) appends a Set-Cookie with default path", () => {
    scope((sink) => {
      cookies().set("a", "1");
      const [line] = set(sink);
      expect(line).toMatch(/^a=1/);
      expect(line).toMatch(/Path=\//);
    });
  });

  test("set accepts object form and encodes all options", () => {
    scope((sink) => {
      cookies().set({
        name: "a",
        value: "1",
        path: "/p",
        domain: "example.com",
        expires: new Date(0),
        maxAge: 60,
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        priority: "high",
        partitioned: true,
      });
      const line = set(sink)[0];
      expect(line).toContain("Path=/p");
      expect(line).toContain("Domain=example.com");
      expect(line).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      expect(line).toContain("Max-Age=60");
      expect(line).toContain("Secure");
      expect(line).toContain("HttpOnly");
      expect(line).toMatch(/SameSite=Lax/i);
      expect(line).toMatch(/Priority=High/i);
      expect(line).toContain("Partitioned");
    });
  });

  test("sameSite accepts true, strict and none", () => {
    scope((sink) => {
      cookies().set("a", "1", { sameSite: true });
      cookies().set("b", "1", { sameSite: "strict" });
      cookies().set("c", "1", { sameSite: "none" });
      const lines = set(sink);
      expect(lines[0]).toMatch(/SameSite=Strict/i);
      expect(lines[1]).toMatch(/SameSite=Strict/i);
      expect(lines[2]).toMatch(/SameSite=None/i);
    });
  });

  test("priority accepts low and medium", () => {
    scope((sink) => {
      cookies().set("a", "1", { priority: "low" });
      cookies().set("b", "1", { priority: "medium" });
      expect(set(sink)[0]).toMatch(/Priority=Low/i);
      expect(set(sink)[1]).toMatch(/Priority=Medium/i);
    });
  });

  test("distinct writes append and never replace existing Set-Cookie fields", () => {
    scope((sink) => {
      sink.append("set-cookie", "pre=1; Path=/");
      cookies().set("a", "1");
      cookies().set("b", "2");
      const lines = set(sink);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe("pre=1; Path=/");
      expect(lines[1]).toMatch(/^a=1/);
      expect(lines[2]).toMatch(/^b=2/);
    });
  });

  test("mutation stays synchronous and the jar is awaitable", async () => {
    await scope(async (sink) => {
      const jar = await cookies();
      jar.set("a", "1");
      expect(set(sink)).toHaveLength(1);
    });
  });

  test("reads reflect writes across cookies() calls and captured jars", () => {
    scope(() => {
      const captured = cookies();
      cookies().set("a", "new");
      expect(cookies().get("a")).toEqual({ name: "a", value: "new" });
      expect(captured.get("a")).toEqual({ name: "a", value: "new" });
      expect(cookies().get("b")).toEqual({ name: "b", value: "2" });
      expect(cookies().has("a")).toBe(true);
      expect(
        cookies()
          .getAll()
          .map((c) => c.name)
          .toSorted(),
      ).toEqual(["a", "b"]);
    }, "a=old; b=2");
  });

  test("getAll(name) filters", () => {
    scope(() => {
      cookies().set("c", "3");
      expect(cookies().getAll("c")).toEqual([{ name: "c", value: "3" }]);
      expect(cookies().getAll("a")).toEqual([{ name: "a", value: "1" }]);
      expect(cookies().getAll("zzz")).toEqual([]);
    }, "a=1");
  });

  test("delete emits an empty value with epoch Expires and Max-Age=0", () => {
    scope((sink) => {
      cookies().delete("a");
      const line = set(sink)[0];
      expect(line).toMatch(/^a=;/);
      expect(line).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      expect(line).toContain("Max-Age=0");
      expect(line).toContain("Path=/");
    }, "a=1");
  });

  test("delete leaves an empty tombstone visible to reads", () => {
    scope(() => {
      const captured = cookies();
      cookies().delete("a");
      expect(cookies().get("a")).toEqual({ name: "a", value: "" });
      expect(cookies().has("a")).toBe(true);
      expect(captured.get("a")).toEqual({ name: "a", value: "" });
    }, "a=1");
  });

  test("delete honours path and domain in object form", () => {
    scope((sink) => {
      cookies().delete({ name: "a", path: "/x", domain: "example.com" });
      const line = set(sink)[0];
      expect(line).toContain("Path=/x");
      expect(line).toContain("Domain=example.com");
      expect(line).toContain("Max-Age=0");
    });
  });

  test("set with maxAge <= 0 expires the cookie but keeps the logical value for reads", () => {
    scope((sink) => {
      cookies().set("a", "v", { maxAge: 0 });
      cookies().set("b", "w", { maxAge: -5 });
      expect(set(sink)[0]).toContain("Max-Age=0");
      expect(cookies().get("a")).toEqual({ name: "a", value: "v" });
      expect(cookies().get("b")).toEqual({ name: "b", value: "w" });
    });
  });

  test("mutation without a response sink throws", () => {
    const request = new Request(url);
    runWithRequest(request, () => {
      expect(() => cookies().set("a", "1")).toThrow();
      expect(() => cookies().delete("a")).toThrow();
    });
  });

  test("mutation outside a request throws", () => {
    expect(() => cookies()).toThrow(/outside a request/);
  });

  test("cookie values are encoded without injecting response fields", () => {
    scope((sink) => {
      const value = "x\r\nSet-Cookie: z=1; /✓";
      cookies().set("a", value);
      expect(set(sink)).toEqual([
        "a=" + encodeURIComponent(value) + "; Path=/",
      ]);
      expect(cookies().get("a")?.value).toBe(value);
      expect(set(sink)[0]).not.toMatch(/[\r\n]/);
    });
  });

  const invalid: Array<[string, () => void]> = [
    ["empty name", () => cookies().set("", "1")],
    ["name with space", () => cookies().set("a b", "1")],
    ["name with semicolon", () => cookies().set("a;b", "1")],
    ["name with equals", () => cookies().set("a=b", "1")],
    ["name with control char", () => cookies().set("a\nb", "1")],
    ["non-string value", () => cookies().set("a", 1 as unknown as string)],
    ["unknown option", () => cookies().set("a", "1", { bogus: true } as never)],
    ["non-integer maxAge", () => cookies().set("a", "1", { maxAge: 1.5 })],
    ["NaN maxAge", () => cookies().set("a", "1", { maxAge: Number.NaN })],
    [
      "invalid Date",
      () => cookies().set("a", "1", { expires: new Date(Number.NaN) }),
    ],
    ["path injection", () => cookies().set("a", "1", { path: "/; Secure" })],
    [
      "domain injection",
      () => cookies().set("a", "1", { domain: "x.com; Path=/" }),
    ],
    ["path with control char", () => cookies().set("a", "1", { path: "/\n" })],
    [
      "bad sameSite",
      () => cookies().set("a", "1", { sameSite: "bad" as never }),
    ],
    [
      "bad priority",
      () => cookies().set("a", "1", { priority: "urgent" as never }),
    ],
    [
      "non-boolean secure",
      () => cookies().set("a", "1", { secure: "yes" as never }),
    ],
    ["delete malformed name", () => cookies().delete("a;b")],
    [
      "delete domain injection",
      () => cookies().delete({ name: "a", domain: "x; y" }),
    ],
  ];

  for (const [label, run] of invalid) {
    test(`rejects ${label} atomically without touching sink or jar`, () => {
      scope((sink) => {
        expect(run).toThrow();
        expect(set(sink)).toEqual([]);
        expect(cookies().getAll()).toEqual([{ name: "a", value: "1" }]);
      }, "a=1");
    });
  }

  test("concurrent contexts keep sinks and jars isolated", async () => {
    const gate = Promise.withResolvers<void>();
    const run = (id: string, wait: Promise<void>) => {
      const sink = new Headers();
      const request = new Request(url, { headers: { cookie: `who=${id}` } });
      return runWithRequest(
        request,
        async () => {
          cookies().set("mine", id);
          await wait;
          expect(cookies().get("mine")).toEqual({ name: "mine", value: id });
          expect(cookies().get("who")).toEqual({ name: "who", value: id });
          return set(sink);
        },
        sink,
      );
    };
    const a = run("a", gate.promise);
    const b = run("b", Promise.resolve());
    await b;
    gate.resolve();
    const [la, lb] = await Promise.all([a, b]);
    expect(la).toHaveLength(1);
    expect(la[0]).toMatch(/^mine=a/);
    expect(lb).toHaveLength(1);
    expect(lb[0]).toMatch(/^mine=b/);
  });

  test("a loader cookie survives redirect and is readable before redirect", async () => {
    let seen: unknown;
    const handler = createRequestHandler({
      requestScope: runWithRequest,
      routes: [{ id: "r", path: "/r", file: "r.ts", mode: "ssr" }],
      modules: {
        r: {
          loader: async () => {
            cookies().set("flash", "hi", { path: "/" });
            seen = cookies().get("flash");
            redirect("/next", 303);
          },
        },
      },
      renderer: {
        name: "test",
        render: async () => new Response("rendered"),
        prerender: async () => "",
      },
    });
    const res = await handler(new Request("http://localhost/r"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/next");
    expect(seen).toEqual({ name: "flash", value: "hi" });
    const lines = res.headers.getSetCookie();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^flash=hi/);
  });
});
