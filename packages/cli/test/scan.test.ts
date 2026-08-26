import { describe, expect, test, afterEach } from "bun:test";
import { detectFramework } from "../src/adopt/scan";
import fs from "node:fs";
import { join } from "node:path";
import os from "node:os";

describe("detectFramework", () => {
  const tmpDirs: string[] = [];

  function createProject(files: string[]): string {
    const dir = fs.mkdtempSync(join(os.tmpdir(), "scan-test-"));
    tmpDirs.push(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      fs.mkdirSync(join(fullPath, ".."), { recursive: true });
      fs.writeFileSync(fullPath, "");
    }
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  describe("Next.js App Router detection", () => {
    test("detects app/page.tsx", () => {
      const dir = createProject(["app/page.tsx"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "next-app",
        routesDir: "app",
        convention: "next-app",
      });
    });

    test("detects src/app/layout.tsx", () => {
      const dir = createProject(["src/app/layout.tsx"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "next-app",
        routesDir: "src/app",
        convention: "next-app",
      });
    });

    test("detects app/page.jsx", () => {
      const dir = createProject(["app/page.jsx"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "next-app",
        routesDir: "app",
        convention: "next-app",
      });
    });
  });

  describe("Next.js Pages Router detection", () => {
    test("detects pages directory", () => {
      const dir = createProject(["pages/index.tsx"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "next-pages",
        routesDir: "pages",
        convention: "next-pages",
      });
    });

    test("detects src/pages directory", () => {
      const dir = createProject(["src/pages/index.tsx"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "next-pages",
        routesDir: "src/pages",
        convention: "next-pages",
      });
    });
  });

  test("detects next.js via package.json dependency", () => {
    const dir = createProject([]);
    expect(detectFramework(dir, { dependencies: { next: "1.0.0" } })).toEqual({
      framework: "next-app",
    });
  });

  describe("Waku detection", () => {
    test("detects via dependency", () => {
      const dir = createProject([]);
      expect(detectFramework(dir, { dependencies: { waku: "1.0.0" } })).toEqual(
        {
          framework: "waku",
        },
      );
    });

    test("detects via waku.config.ts file", () => {
      const dir = createProject(["waku.config.ts"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "waku",
      });
    });
  });

  describe("Tanstack Router detection", () => {
    test("detects @tanstack/react-router", () => {
      const dir = createProject([]);
      expect(
        detectFramework(dir, {
          dependencies: { "@tanstack/react-router": "1.0.0" },
        }),
      ).toEqual({
        framework: "tanstack",
      });
    });

    test("detects @tanstack/react-start", () => {
      const dir = createProject([]);
      expect(
        detectFramework(dir, {
          dependencies: { "@tanstack/react-start": "1.0.0" },
        }),
      ).toEqual({
        framework: "tanstack",
      });
    });
  });

  describe("React Router detection", () => {
    test("detects react-router dependency", () => {
      const dir = createProject([]);
      expect(
        detectFramework(dir, { dependencies: { "react-router": "1.0.0" } }),
      ).toEqual({
        framework: "react-router",
      });
    });

    test("detects react-router-dom dependency", () => {
      const dir = createProject([]);
      expect(
        detectFramework(dir, { dependencies: { "react-router-dom": "1.0.0" } }),
      ).toEqual({
        framework: "react-router",
      });
    });

    test("detects @remix-run/react dependency", () => {
      const dir = createProject([]);
      expect(
        detectFramework(dir, { dependencies: { "@remix-run/react": "1.0.0" } }),
      ).toEqual({
        framework: "react-router",
      });
    });

    test("detects react-router.config.ts file", () => {
      const dir = createProject(["react-router.config.ts"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "react-router",
      });
    });

    test("detects remix.config.js file", () => {
      const dir = createProject(["remix.config.js"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "react-router",
      });
    });
  });

  describe("Vite React detection", () => {
    test("detects vite.config.ts", () => {
      const dir = createProject(["vite.config.ts"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "vite-react",
      });
    });

    test("detects vite.config.js", () => {
      const dir = createProject(["vite.config.js"]);
      expect(detectFramework(dir, undefined)).toEqual({
        framework: "vite-react",
      });
    });
  });

  test("detects react dependency", () => {
    const dir = createProject([]);
    expect(detectFramework(dir, { dependencies: { react: "1.0.0" } })).toEqual({
      framework: "react",
    });
  });

  test("returns unknown for no matches", () => {
    const dir = createProject([]);
    expect(detectFramework(dir, undefined)).toEqual({
      framework: "unknown",
    });
  });

  describe("Moonshine routes directory inclusion", () => {
    test("adds routesDir for src/routes", () => {
      const dir = createProject(["src/routes/index.tsx"]);
      expect(
        detectFramework(dir, { dependencies: { react: "1.0.0" } }),
      ).toEqual({
        framework: "react",
        routesDir: "src/routes",
        convention: "moonshine",
      });
    });

    test("adds routesDir for routes", () => {
      const dir = createProject(["routes/index.tsx"]);
      expect(detectFramework(dir, { dependencies: { waku: "1.0.0" } })).toEqual(
        {
          framework: "waku",
          routesDir: "routes",
          convention: "moonshine",
        },
      );
    });

    test("adds routesDir for app/routes", () => {
      const dir = createProject(["app/routes/index.tsx"]);
      expect(
        detectFramework(dir, { dependencies: { "react-router": "1.0.0" } }),
      ).toEqual({
        framework: "react-router",
        routesDir: "app/routes",
        convention: "moonshine",
      });
    });
  });
});
