import { describe, expect, test } from "bun:test";
import { compilePattern, matchPath } from "../src/pattern";

describe("compilePattern", () => {
  test("static matches exact", () => {
    const p = compilePattern("/about");
    expect(p.match("/about")?.params).toEqual({});
    expect(p.match("/other")).toBeNull();
  });

  test("dynamic captures a parameter", () => {
    const p = compilePattern("/users/:id");
    const m = p.match("/users/42");
    expect(m?.params).toEqual({ id: "42" });
    expect(m?.score).toEqual([3, 2]);
  });

  test("optional segment may be omitted", () => {
    const p = compilePattern("/:tab?");
    expect(p.match("/")?.params).toEqual({});
    expect(p.match("/profile")?.params).toEqual({ tab: "profile" });
  });

  test("rest captures the remainder", () => {
    const p = compilePattern("/blog/*rest");
    const m = p.match("/blog/a/b");
    expect(m?.params).toEqual({ rest: "a/b" });
    expect(m?.score).toEqual([3, 0]);
  });

  test("decodes parameter values", () => {
    const p = compilePattern("/users/:id");
    expect(p.match("/users/bob%20smith")?.params.id).toBe("bob smith");
  });

  test("malformed encoding returns no match", () => {
    const p = compilePattern("/users/:id");
    expect(p.match("/users/bob%ZZ")).toBeNull();
  });

  test("precedence reflects segment kind", () => {
    const p = compilePattern("/blog/:slug?");
    expect(p.precedence).toEqual([3, 1]);
  });
});

describe("matchPath", () => {
  test("returns a match object", () => {
    const m = matchPath("/users/:id", "/users/7");
    expect(m).not.toBeNull();
    expect(m!.params.id).toBe("7");
    expect(m!.pattern).toBe("/users/:id");
  });

  test("rejects length mismatch", () => {
    expect(matchPath("/a/b", "/a")).toBeNull();
  });
});
