import { describe, expect, test } from "bun:test";
import { mergeRoutes } from "../src/inherit";
import type { RouteDefinition } from "@tschk/moonshine-framework";

export interface InheritableLayout {
  id: string;
  layouts: string[];
}

describe("mergeRoutes", () => {
  test("combines nested route definitions with inheritable layouts", () => {
    const routes: RouteDefinition[] = [
      { id: "index", path: "/", file: "index.tsx" },
      { id: "about", path: "/about", file: "about.tsx" },
      { id: "nested/index", path: "/nested", file: "nested/index.tsx" },
    ];

    const layouts: InheritableLayout[] = [
      { id: "index", layouts: ["layout.tsx"] },
      { id: "about", layouts: ["layout.tsx"] },
      { id: "nested/index", layouts: ["layout.tsx", "nested/layout.tsx"] },
    ];

    const merged = mergeRoutes(routes, layouts as unknown as RouteDefinition[]);

    expect(merged.length).toBe(3);

    const indexRoute = merged.find((r) => r.id === "index");
    expect(indexRoute?.layouts).toEqual(["layout.tsx"]);

    const aboutRoute = merged.find((r) => r.id === "about");
    expect(aboutRoute?.layouts).toEqual(["layout.tsx"]);

    const nestedRoute = merged.find((r) => r.id === "nested/index");
    expect(nestedRoute?.layouts).toEqual(["layout.tsx", "nested/layout.tsx"]);
  });

  test("handles empty layouts gracefully", () => {
    const routes: RouteDefinition[] = [
      { id: "index", path: "/", file: "index.tsx" },
    ];
    const layouts: InheritableLayout[] = [];

    const merged = mergeRoutes(routes, layouts as unknown as RouteDefinition[]);

    expect(merged.length).toBe(1);
    const indexRoute = merged.find((r) => r.id === "index");
    expect(indexRoute?.layouts).toBeUndefined();
  });
});
