import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { analyzeModule, classifyRoute } from "../src";

const fixtureDir = join(import.meta.dir, "fixtures", "modes");

function fixture(name: string): string {
  return join(fixtureDir, name);
}

describe("classifyRoute", () => {
  test("honors explicit override", () => {
    const facts = analyzeModule(fixture("static.tsx"));
    const decision = classifyRoute({ explicit: "island", facts });
    expect(decision).toEqual({
      mode: "island",
      reason: "explicit route configuration",
    });
  });

  test("selects api for handler export", () => {
    const facts = analyzeModule(fixture("api.ts"));
    expect(facts.exportsHandler).toBe(true);
    expect(classifyRoute({ facts })).toEqual({
      mode: "api",
      reason: "exports request handler",
    });
  });

  test("selects spa for root client boundary", () => {
    const facts = analyzeModule(fixture("client.client.tsx"));
    expect(facts.clientBoundary).toBe(true);
    expect(classifyRoute({ facts })).toEqual({
      mode: "spa",
      reason: "route root is a client boundary",
    });
  });

  test("selects ssr for request-bound loader", () => {
    const facts = analyzeModule(fixture("loader.ts"));
    expect(facts.requestBound).toBe(true);
    expect(facts.exportsLoader).toBe(true);
    expect(classifyRoute({ facts })).toEqual({
      mode: "ssr",
      reason: "uses request-time server data",
    });
  });

  test("selects island for interactive child", () => {
    const facts = analyzeModule(fixture("interactive.tsx"));
    expect(facts.interactive).toBe(true);
    expect(classifyRoute({ facts })).toEqual({
      mode: "island",
      reason: "contains an interactive client subtree",
    });
  });

  test("selects static for deterministic module", () => {
    const facts = analyzeModule(fixture("static.tsx"));
    expect(classifyRoute({ facts })).toEqual({
      mode: "static",
      reason: "deterministic build-time route",
    });
  });

  test("falls back to ssr for unresolved dynamic import", () => {
    const facts = analyzeModule(fixture("unresolved.ts"));
    expect(facts.unresolvedDynamicImport).toBe(true);
    expect(classifyRoute({ facts })).toEqual({
      mode: "ssr",
      reason: "dynamic behavior could not be resolved safely",
    });
  });

  test("produces deterministic output", () => {
    const path = fixture("static.tsx");
    const first = classifyRoute({ facts: analyzeModule(path) });
    const second = classifyRoute({ facts: analyzeModule(path) });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
