import { describe, expect, test } from "bun:test";
import { toHref } from "../src/location";

describe("toHref", () => {
  test("passes strings through", () => {
    expect(toHref("/a?b=1#c")).toBe("/a?b=1#c");
  });

  test("assembles a partial path", () => {
    expect(toHref({ pathname: "/a", search: "b=1", hash: "c" })).toBe(
      "/a?b=1#c",
    );
  });

  test("does not double the separators", () => {
    expect(toHref({ pathname: "/a", search: "?b=1", hash: "#c" })).toBe(
      "/a?b=1#c",
    );
  });

  test("omits empty parts", () => {
    expect(toHref({ pathname: "/a" })).toBe("/a");
    expect(toHref({})).toBe("");
  });
});
