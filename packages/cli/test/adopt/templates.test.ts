import { describe, expect, test, mock } from "bun:test";
import { planTemplateRoutes } from "../../src/adopt/templates.js";
import type { AdoptScan } from "../../src/adopt/types.js";

mock.module("node:fs/promises", () => ({
  readFile: async (path: string, _options: any) => {
    if (path.includes("moonshine/routes/index.tsx")) {
      const EACCES = new Error("Permission denied");
      (EACCES as any).code = "EACCES";
      throw EACCES;
    }
    return "content";
  },
}));

describe("planTemplateRoutes", () => {
  test("re-throws non-ENOENT errors when reading existing files", async () => {
    const scan: AdoptScan = {
      projectDir: "/mock/dir",
      framework: "svelte",
      routes: [],
      imports: [],
      conventions: [],
      templates: [
        {
          file: "src/routes/+page.svelte",
          ok: true,
          route: "/",
          nodes: 10,
          irVersion: 7,
          ir: { root: [], version: 7, kind: "template" },
          generated: "moonshine/routes/index.tsx",
        },
      ],
      manual: [],
    };

    await expect(planTemplateRoutes(scan)).rejects.toThrow("Permission denied");
  });
});
