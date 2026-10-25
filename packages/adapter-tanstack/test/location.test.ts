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

  test("falls back to string for malformed JSON", () => {
    expect(parseSearch("?f={bad}")).toEqual({ f: "{bad}" });
  });

  test("handles empty values and keys without equals", () => {
    expect(parseSearch("?empty=&key")).toEqual({ empty: "", key: "" });
  });

  test("takes the last value for duplicate keys", () => {
    expect(parseSearch("?a=1&a=2")).toEqual({ a: 2 });
  });

  test("returns an empty record for no query", () => {
    expect(parseSearch("")).toEqual({});
  });

  test("decodes JSON arrays", () => {
    expect(parseSearch("?arr=[1,2,3]")).toEqual({ arr: [1, 2, 3] });
  });

  test("decodes JSON null and false", () => {
    expect(parseSearch("?n=null&f=false")).toEqual({ n: null, f: false });
  });

  test("decodes strings formatted as JSON", () => {
    expect(parseSearch('?s="string"')).toEqual({ s: "string" });
  });

  test("handles URL encoded characters", () => {
    expect(parseSearch("?q=%22hello%20world%22")).toEqual({ q: "hello world" });
  });

  test("decodes plus signs as spaces", () => {
    expect(parseSearch("?q=hello+world")).toEqual({ q: "hello world" });
  });

  test("handles malformed JSON gracefully", () => {
    expect(parseSearch("?bad=[1,2")).toEqual({ bad: "[1,2" });
  });

  test("overwrites duplicate keys", () => {
    expect(parseSearch("?a=1&a=2")).toEqual({ a: 2 });
  });

  test("handles query without leading ?", () => {
    expect(parseSearch("page=2&open=true")).toEqual({ page: 2, open: true });
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

  test("stringifies objects and arrays to JSON", () => {
    expect(stringifySearch({ obj: { a: 1 }, arr: [1, 2] })).toBe(
      "?obj=%7B%22a%22%3A1%7D&arr=%5B1%2C2%5D",
    );
  });

  test("stringifies numbers, booleans, and null to JSON", () => {
    expect(stringifySearch({ num: 42, bool: true, nul: null })).toBe(
      "?num=42&bool=true&nul=null",
    );
  });

  test("handles strings with special characters", () => {
    expect(stringifySearch({ q: "hello world&foo=bar" })).toBe(
      "?q=hello+world%26foo%3Dbar",
    );
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
