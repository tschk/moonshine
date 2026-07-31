import { describe, expect, test } from "bun:test";
import { createRouteGraph, matchRoutes } from "../src/graph";

describe("createRouteGraph", () => {
  test("static beats dynamic beats rest", () => {
    const graph = createRouteGraph([
      { id: "rest", path: "/blog/*rest", file: "rest.tsx" },
      { id: "slug", path: "/blog/:slug", file: "slug.tsx" },
      { id: "new", path: "/blog/new", file: "new.tsx" },
    ]);
    expect(matchRoutes(graph, "/blog/new")?.route.id).toBe("new");
    expect(matchRoutes(graph, "/blog/post")?.params).toEqual({ slug: "post" });
  });

  test("throws for ambiguous routes", () => {
    expect(() =>
      createRouteGraph([
        { id: "a", path: "/users/:param", file: "a.tsx" },
        { id: "b", path: "/users/:id", file: "b.tsx" },
      ]),
    ).toThrow(/Ambiguous routes "a" and "b" both match \/users\/:param/);
  });
});
