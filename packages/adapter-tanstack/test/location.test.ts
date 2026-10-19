import { describe, expect, test } from "bun:test";
import {
  buildHref,
  interpolatePath,
  parseSearch,
  stringifySearch,
} from "../src/location";

describe("parseSearch", () => {
  test("decodes JSON values", () => {
    expect(parseSearch("?page=2&open=true")).toEqual({ page: 2, open: true });
  });

  test("keeps non-JSON values as strings", () => {
    expect(parseSearch("?q=hello")).toEqual({ q: "hello" });
  });

  test("decodes nested JSON", () => {
    expect(parseSearch('?f={"a":1}')).toEqual({ f: { a: 1 } });
  });

  test("returns an empty record for no query", () => {
    expect(parseSearch("")).toEqual({});
  });

  test("handles strings without leading ?", () => {
    expect(parseSearch("q=hello")).toEqual({ q: "hello" });
  });

  test("handles duplicate keys by taking the last value", () => {
    expect(parseSearch("?a=1&a=2")).toEqual({ a: 2 });
  });

  test("parses url-encoded JSON", () => {
    expect(parseSearch("?data=%7B%22foo%22%3A%22bar%22%7D")).toEqual({ data: { foo: "bar" } });
  });

  test("decodes null and boolean literals correctly", () => {
    expect(parseSearch("?a=null&b=true&c=false")).toEqual({ a: null, b: true, c: false });
  });
});

describe("stringifySearch", () => {
  test("round-trips through parseSearch", () => {
    const search = { page: 2, q: "hi", open: false };
    expect(parseSearch(stringifySearch(search))).toEqual(search);
  });

  test("prefixes with ? and drops undefined", () => {
    expect(stringifySearch({ a: 1, b: undefined })).toBe("?a=1");
  });

  test("returns an empty string for an empty record", () => {
    expect(stringifySearch({})).toBe("");
  });
});

describe("interpolatePath", () => {
  test("fills $param segments", () => {
    expect(interpolatePath("/posts/$postId", { postId: "7" })).toBe("/posts/7");
  });

  test("fills a $ splat", () => {
    expect(interpolatePath("/files/$", { "*": "a/b" })).toBe("/files/a/b");
  });

  test("leaves unknown params in place", () => {
    expect(interpolatePath("/posts/$postId")).toBe("/posts/$postId");
  });
});

describe("buildHref", () => {
  test("combines path, search and hash", () => {
    expect(
      buildHref({
        to: "/posts/$id",
        params: { id: "1" },
        search: { p: 2 },
        hash: "top",
      }),
    ).toBe("/posts/1?p=2#top");
  });

  test("accepts a search updater against the current search", () => {
    expect(
      buildHref(
        { to: "/a", search: (current) => ({ ...current, p: 2 }) },
        { q: "x" },
      ),
    ).toBe("/a?q=x&p=2");
  });

  test("does not double the hash marker", () => {
    expect(buildHref({ to: "/a", hash: "#b" })).toBe("/a#b");
  });
});
