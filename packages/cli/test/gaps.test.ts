import { describe, expect, test } from "bun:test";
import { templateManualWork } from "../src/adopt/gaps.js";
import type { TemplateFile } from "../src/adopt/types.js";

describe("templateManualWork", () => {
  test("returns empty array for non-template frameworks", () => {
    const notes = templateManualWork("next-app", [{ file: "page.tsx", ok: true }]);
    expect(notes).toEqual([]);
  });

  test("returns empty array if no templates provided", () => {
    const notes = templateManualWork("svelte", []);
    expect(notes).toEqual([]);
  });

  test("returns baseline notes for svelte", () => {
    const templates: TemplateFile[] = [
      { file: "App.svelte", ok: true, route: "/", nodes: 5, generated: "src/routes/app.ts" }
    ];
    const notes = templateManualWork("svelte", templates);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain("runes, stores, reactive statements");
    expect(notes[1]).toContain("Re-run `moonshine adopt --force` after editing a template.");
  });

  test("returns baseline notes for astro including rejects", () => {
    const templates: TemplateFile[] = [
      { file: "page.astro", ok: true, route: "/page", nodes: 2, generated: "src/routes/page.ts" }
    ];
    const notes = templateManualWork("astro", templates);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain("frontmatter is blanked, never executed");
    expect(notes[1]).toContain("Astro templates that use an imported component");
    expect(notes[2]).toContain("Re-run `moonshine adopt --force`");
  });

  test("returns angular specific notes", () => {
    const templates: TemplateFile[] = [
      { file: "app.component.html", ok: true, route: "/", nodes: 3, generated: "src/routes/app.ts" }
    ];
    const notes = templateManualWork("angular", templates);
    expect(notes).toHaveLength(4);
    expect(notes[0]).toContain("component class is not executed");
    expect(notes[1]).toContain("Angular templates that use");
    expect(notes[2]).toContain("Re-run `moonshine adopt --force`");
    expect(notes[3]).toContain("Angular has no file-based routing");
  });

  test("appends notes for failed templates", () => {
    const templates: TemplateFile[] = [
      { file: "Broken.svelte", ok: false, error: "Syntax error" }
    ];
    const notes = templateManualWork("svelte", templates);
    expect(notes).toHaveLength(3);
    expect(notes[2]).toContain("Broken.svelte: did not compile — Syntax error");
  });

  test("appends notes for templates without routes", () => {
    const templates: TemplateFile[] = [
      { file: "Component.vue", ok: true, route: undefined, nodes: 10, generated: "src/components/Component.ts" }
    ];
    const notes = templateManualWork("vue", templates);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain("the Composition API");
    expect(notes[2]).toContain("Component.vue: compiled (10 nodes) but maps to no URL");
    expect(notes[2]).toContain("src/components/Component.ts");
  });
});
