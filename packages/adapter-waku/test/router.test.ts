import { describe, expect, test } from "bun:test";
import { matchRouteParams, normalizePath, toHref } from "../src/router";
import { json } from "../src/server";

describe("normalizePath", () => {
  test("adds Waku's trailing slash", () => {
    expect(normalizePath("/posts")).toBe("/posts/");
  });

  test("leaves an already-normalised path alone", () => {
    expect(normalizePath("/posts/")).toBe("/posts/");
  });

  test("treats an empty path as root", () => {
    expect(normalizePath("")).toBe("/");
  });
});

describe("toHref", () => {
  test("passes strings through", () => {
    expect(toHref("/a?b=1")).toBe("/a?b=1");
  });

  test("serialises a search record", () => {
    expect(toHref({ pathname: "/a", search: { page: 2, q: "x" } })).toBe(
      "/a?page=2&q=x",
    );
  });

  test("omits an empty search", () => {
    expect(toHref({ pathname: "/a" })).toBe("/a");
    expect(toHref({ pathname: "/a", search: { q: undefined } })).toBe("/a");
  });
});

describe("matchRouteParams", () => {
  test("matches a static route", () => {
    expect(matchRouteParams("/about", "/about")).toEqual({});
  });

  test("extracts a [slug] param", () => {
    expect(matchRouteParams("/posts/[slug]", "/posts/hello")).toEqual({
      slug: "hello",
    });
  });

  test("extracts a [...rest] catch-all", () => {
    expect(matchRouteParams("/files/[...path]", "/files/a/b/c")).toEqual({
      path: "a/b/c",
    });
  });

  test("returns null when the path does not match", () => {
    expect(matchRouteParams("/posts/[slug]", "/about")).toBeNull();
    expect(matchRouteParams("/posts/[slug]", "/posts")).toBeNull();
    expect(matchRouteParams("/posts/[slug]", "/posts/a/b")).toBeNull();
  });

  test("is insensitive to trailing slashes", () => {
    expect(matchRouteParams("/posts/[slug]/", "/posts/hello")).toEqual({
      slug: "hello",
    });
  });
});

describe("server helpers", () => {
  test("json sets content-type", async () => {
    const res = json({ ok: true }, { status: 202 });
    expect(res.status).toBe(202);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});
