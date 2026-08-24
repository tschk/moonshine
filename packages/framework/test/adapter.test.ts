import { describe, expect, test } from "bun:test";
import { defineRoute } from "../src/adapter";
import type { RouteDefinition } from "../src/routes";

describe("defineRoute", () => {
  test("returns the exact route definition provided", () => {
    const route: RouteDefinition = {
      id: "test-route",
      path: "/test",
      file: "test.tsx",
      mode: "ssr",
      runtime: "bun",
    };

    const result = defineRoute(route);

    expect(result).toBe(route);
    expect(result).toEqual({
      id: "test-route",
      path: "/test",
      file: "test.tsx",
      mode: "ssr",
      runtime: "bun",
    });
  });
});
