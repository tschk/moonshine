import { describe, expect, test } from "bun:test";
import { cookies, draftMode, headers, runWithRequest } from "../src/headers";

function request(init?: RequestInit): Request {
  return new Request("https://example.com/page", init);
}

describe("next/headers", () => {
  test("headers() reads the request inside runWithRequest", () => {
    const req = request({ headers: { "x-trace": "abc", accept: "text/html" } });
    const seen = runWithRequest(req, () => headers());
    expect(seen.get("x-trace")).toBe("abc");
    expect(seen.get("accept")).toBe("text/html");
  });

  test("headers() throws outside a request", () => {
    expect(() => headers()).toThrow(/outside a request/);
  });

  test("cookies() throws outside a request", () => {
    expect(() => cookies()).toThrow(/outside a request/);
  });

  test("cookies() parses the cookie header", () => {
    const req = request({ headers: { cookie: "session=abc; theme=dark" } });
    runWithRequest(req, () => {
      const jar = cookies();
      expect(jar.get("session")).toEqual({ name: "session", value: "abc" });
      expect(jar.get("theme")).toEqual({ name: "theme", value: "dark" });
      expect(jar.has("session")).toBe(true);
      expect(jar.has("nope")).toBe(false);
      expect(jar.get("nope")).toBeUndefined();
      expect(jar.getAll()).toEqual([
        { name: "session", value: "abc" },
        { name: "theme", value: "dark" },
      ]);
    });
  });

  test("cookies() percent-decodes values", () => {
    const req = request({ headers: { cookie: "next=%2Fdash%3Fa%3D1" } });
    expect(runWithRequest(req, () => cookies().get("next")?.value)).toBe(
      "/dash?a=1",
    );
  });

  test("cookies() is empty without a cookie header", () => {
    expect(runWithRequest(request(), () => cookies().getAll())).toEqual([]);
  });

  test("cookies() skips malformed segments", () => {
    const req = request({ headers: { cookie: "bare; a=1; =2" } });
    expect(runWithRequest(req, () => cookies().getAll())).toEqual([
      { name: "a", value: "1" },
    ]);
  });

  test("nested runWithRequest scopes shadow correctly", () => {
    const outer = request({ headers: { "x-id": "outer" } });
    const inner = request({ headers: { "x-id": "inner" } });
    runWithRequest(outer, () => {
      expect(headers().get("x-id")).toBe("outer");
      runWithRequest(inner, () => {
        expect(headers().get("x-id")).toBe("inner");
      });
      expect(headers().get("x-id")).toBe("outer");
    });
  });

  test("the request context survives an await boundary", async () => {
    const req = request({ headers: { "x-async": "yes" } });
    const value = await runWithRequest(req, async () => {
      await Promise.resolve();
      return headers().get("x-async");
    });
    expect(value).toBe("yes");
  });

  test("draftMode() is always disabled", () => {
    expect(draftMode().isEnabled).toBe(false);
  });
});
