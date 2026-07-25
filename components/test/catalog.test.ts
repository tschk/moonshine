import { describe, expect, test } from "bun:test";
import catalog from "../catalog/components.json";
import * as components from "../src/index";

const ID_TO_EXPORT: Record<string, string> = Object.fromEntries(
  catalog.components.map((c: { id: string }) => [
    c.id,
    c.id
      .split("-")
      .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(""),
  ]),
);

describe("catalog exports", () => {
  test("catalog has 44 components", () => {
    expect(catalog.components).toHaveLength(44);
  });

  test("every catalog id has a named export", () => {
    const missing: string[] = [];
    for (const [id, exportName] of Object.entries(ID_TO_EXPORT)) {
      if (!(exportName in components)) {
        missing.push(`${id} -> ${exportName}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
