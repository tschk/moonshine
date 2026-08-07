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

describe("optional segments backtrack", () => {
  // The regression: the matcher consumed a part whenever one was present and
  // never gave it back, so `/:lang?/about` matched `/en/about` and then failed
  // `/about` — an i18n prefix route 404ing on its own default locale. A failed
  // match is indistinguishable from no route, so it surfaced as a bare 404.
  test("matches with the optional segment absent", () => {
    expect(matchPath("/:lang?/about", "/about")?.params).toEqual({});
  });

  test("still binds the optional segment when it is present", () => {
    expect(matchPath("/:lang?/about", "/en/about")?.params).toEqual({
      lang: "en",
    });
  });

  test("does not match when the rest of the pattern cannot", () => {
    expect(matchPath("/:lang?/about", "/en/contact")).toBeNull();
    expect(matchPath("/:lang?/about", "/a/b/about")).toBeNull();
  });

  test("handles two optionals before a static tail", () => {
    expect(matchPath("/:a?/:b?/end", "/end")?.params).toEqual({});
    expect(matchPath("/:a?/:b?/end", "/x/end")?.params).toEqual({ a: "x" });
    expect(matchPath("/:a?/:b?/end", "/x/y/end")?.params).toEqual({
      a: "x",
      b: "y",
    });
  });
});

describe("rest segments decode per part", () => {
  // Decoding the joined string let an encoded separator smuggle structure past
  // the router: a handler doing `join(dir, params.path)` on the result read
  // outside its directory, and `a%2Fb` was indistinguishable from `a/b`.
  test("rejects an encoded traversal", () => {
    expect(matchPath("/files/*path", "/files/%2e%2e%2fsecret")).toBeNull();
    expect(matchPath("/files/*path", "/files/..%2Fsecret")).toBeNull();
  });

  test("rejects an encoded separator", () => {
    expect(matchPath("/files/*path", "/files/a%2Fb")).toBeNull();
  });

  test("still captures an ordinary nested path", () => {
    expect(matchPath("/files/*path", "/files/a/b/c.txt")?.params).toEqual({
      path: "a/b/c.txt",
    });
  });

  test("still decodes ordinary escapes within a part", () => {
    expect(matchPath("/files/*path", "/files/my%20file.txt")?.params).toEqual({
      path: "my file.txt",
    });
  });
});
