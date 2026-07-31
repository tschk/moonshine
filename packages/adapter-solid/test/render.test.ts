import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createBridgedSignal,
  fromMoonshineSignal,
  renderCrepusIrSolid,
} from "../src/index";
import { createSignal } from "@tschk/moonshine";
import {
  asArray,
  bindItemTemplate,
  sparklinePoints,
} from "@tschk/crepus-moonshine/ir";

const KINDS = [
  "text",
  "stack",
  "scroll",
  "button",
  "toggle",
  "checkbox",
  "progress",
  "meter",
  "sparkline",
  "badge",
  "divider",
  "spacer",
  "image",
  "if",
  "forEach",
  "list",
  "listItem",
] as const;

describe("renderCrepusIrSolid surface", () => {
  test("exports renderer + bridge helpers", () => {
    expect(typeof renderCrepusIrSolid).toBe("function");
    expect(typeof fromMoonshineSignal).toBe("function");
    expect(typeof createBridgedSignal).toBe("function");
  });

  test("source covers full IR kind surface", () => {
    const src = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    for (const kind of KINDS) {
      expect(src).toContain(`case "${kind}"`);
    }
    expect(src).toContain("data-crepus-unknown");
    expect(src).toContain("data-crepus-target");
  });

  test("shared IR helpers power solid path", () => {
    expect(asArray({ kind: "text", content: "x" })).toHaveLength(1);
    const bound = bindItemTemplate(
      { kind: "badge", label: "hi-{item}" },
      "z",
    ) as { label?: string };
    expect(bound.label).toBe("hi-z");
    expect(sparklinePoints([0, 1, 0], 10, 10).length).toBeGreaterThan(0);
  });

  test("bridge writes through to moonshine signal", () => {
    const ms = createSignal(1);
    const [, set] = fromMoonshineSignal(ms);
    set(5);
    expect(ms()).toBe(5);
    set((n) => n + 1);
    expect(ms()).toBe(6);
  });
});
