import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { analyzeModule } from "../src/analyze.js";

function analyzeSource(sourceCode: string, filename = "test.tsx") {
  const program = {
    getSourceFile: (file: string) => {
      if (file === filename) {
        return ts.createSourceFile(
          filename,
          sourceCode,
          ts.ScriptTarget.Latest,
          true,
          filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        );
      }
      return undefined;
    },
  } as unknown as ts.Program;

  return analyzeModule(filename, program);
}

describe("analyzeModule", () => {
  test("detects clientBoundary from 'use client' directive", () => {
    const facts = analyzeSource("'use client';\nexport default function App() {}");
    expect(facts.clientBoundary).toBe(true);
  });

  test("detects clientBoundary from file suffix", () => {
    const facts = analyzeSource("export default function App() {}", "app.client.tsx");
    expect(facts.clientBoundary).toBe(true);
  });

  test("detects serverOnly from file suffix", () => {
    const facts = analyzeSource("export default function App() {}", "app.server.tsx");
    expect(facts.serverOnly).toBe(true);
  });

  test("detects exportsHandler from 'handler' export", () => {
    const facts = analyzeSource("export function handler() {}");
    expect(facts.exportsHandler).toBe(true);
  });

  test("detects exportsHandler from HTTP method exports", () => {
    expect(analyzeSource("export const GET = () => {}").exportsHandler).toBe(true);
    expect(analyzeSource("export function POST() {}").exportsHandler).toBe(true);
    expect(analyzeSource("export { myFunc as PUT }").exportsHandler).toBe(true);
  });

  test("does not detect exportsHandler for non-exported methods", () => {
    const facts = analyzeSource("function GET() {}");
    expect(facts.exportsHandler).toBe(false);
  });

  test("detects exportsLoader", () => {
    const facts = analyzeSource("export const loader = async () => {}");
    expect(facts.exportsLoader).toBe(true);
  });

  test("detects exportsAction", () => {
    const facts = analyzeSource("export function action() {}");
    expect(facts.exportsAction).toBe(true);
  });

  test("detects requestBound from specific module imports", () => {
    expect(analyzeSource("import { anything } from 'next/headers'").requestBound).toBe(true);
    expect(analyzeSource("import { something } from './cookies.ts'").requestBound).toBe(true);
    expect(analyzeSource("import { xyz } from 'request'").requestBound).toBe(true);
  });

  test("detects requestBound from specific binding imports", () => {
    expect(analyzeSource("import { cookies } from 'any-module'").requestBound).toBe(true);
    expect(analyzeSource("import { headers, other } from 'some-module'").requestBound).toBe(true);
    expect(analyzeSource("import { draftMode } from 'utils'").requestBound).toBe(true);
    expect(analyzeSource("import { request } from 'core'").requestBound).toBe(true);
  });

  test("does not detect requestBound for unrelated imports", () => {
    const facts = analyzeSource("import { useState } from 'react'");
    expect(facts.requestBound).toBe(false);
  });

  test("detects interactive from JSX event attributes", () => {
    const facts = analyzeSource("export default function Btn() { return <button onClick={() => {}}>Click</button> }");
    expect(facts.interactive).toBe(true);
  });

  test("detects interactive from island calls", () => {
    expect(analyzeSource("island(Component)").interactive).toBe(true);
    expect(analyzeSource("myLib.island(Component)").interactive).toBe(true);
  });

  test("detects unresolvedDynamicImport", () => {
    const facts = analyzeSource("const moduleName = 'fs'; import(moduleName);");
    expect(facts.unresolvedDynamicImport).toBe(true);
  });

  test("does not detect unresolvedDynamicImport for string literals", () => {
    const facts = analyzeSource("import('fs');");
    expect(facts.unresolvedDynamicImport).toBe(false);
  });

  test("returns default facts for empty module", () => {
    const facts = analyzeSource("");
    expect(facts).toEqual({
      clientBoundary: false,
      serverOnly: false,
      exportsHandler: false,
      exportsLoader: false,
      exportsAction: false,
      requestBound: false,
      interactive: false,
      unresolvedDynamicImport: false,
    });
  });
});
