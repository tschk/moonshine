import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IR_VERSION, parseCrepus, renderCrepusIr } from "../src/index";

function html(source: string, context?: Record<string, string>): string {
  return renderToStaticMarkup(renderCrepusIr(parseCrepus(source, context)));
}

describe("parseCrepus", () => {
  test("parses .crepus source through the Rust parser", () => {
    const ir = parseCrepus('div flex\n  span\n    "hi"');
    expect(ir.version).toBe(IR_VERSION);
    expect(ir.root).toHaveLength(1);
    expect(ir.root[0]!.kind).toBe("stack");
  });

  test("binds template variables from a context", () => {
    const ir = parseCrepus('span\n  "hello {name}"', { name: "Ada" });
    expect(JSON.stringify(ir)).toContain("hello Ada");
  });
});

describe("renderCrepusIr", () => {
  test("preserves class tokens as className", () => {
    const out = html('div flex flex-col gap-4\n  span text-lg\n    "hi"');
    expect(out).toContain('class="flex flex-col gap-4"');
    expect(out).toContain('class="text-lg"');
  });

  test("emits no inline styles", () => {
    const out = html(
      'div flex flex-col gap-4 text-zinc-100 bg-zinc-950\n  span\n    "hi"',
    );
    expect(out).not.toContain("style=");
  });

  test("renders anchors with href, target and rel", () => {
    const out = html(
      'a href="https://example.com" target="_blank" rel="noopener" text-zinc-100\n  span\n    "crepuscularity"',
    );
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener"');
    expect(out).toContain('class="text-zinc-100"');
  });

  test("stamps the IR version on the root", () => {
    const out = html('span\n  "hi"');
    expect(out).toContain('data-crepus-root="true"');
    expect(out).toContain(`data-crepus-ir-version="${IR_VERSION}"`);
  });

  test.each([
    ['ul\n  li\n    "a"', ["<ul", "<li"]],
    ['ol\n  li\n    "a"', ["<ol", "<li"]],
    ['button\n  "Go"', ['<button type="button"', "Go"]],
    ['img src="/a.png" alt="a"', ['<img src="/a.png"', 'alt="a"']],
    [
      'iframe src="https://example.com"',
      ["<iframe", 'src="https://example.com"'],
    ],
  ])("renders %p to the right html element", (source, expected) => {
    const out = html(source as string);
    for (const fragment of expected as string[]) {
      expect(out).toContain(fragment);
    }
  });

  test("renders an empty document without throwing", () => {
    const out = renderToStaticMarkup(
      renderCrepusIr({ version: IR_VERSION, root: [] }),
    );
    expect(out).toContain('data-crepus-root="true"');
  });
});
