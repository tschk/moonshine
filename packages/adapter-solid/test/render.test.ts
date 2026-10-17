import { describe, expect, test } from "bun:test";
import { createSignal } from "@tschk/moonshine";
import {
  renderToString,
  renderCrepusIrSolid,
  type RenderCrepusOptions,
} from "../src/ssr";
import { IR_VERSION, parseCrepus } from "@tschk/crepuscularity-wasm";
import { createBridgedSignal, fromMoonshineSignal } from "../src/index";

function html(
  source: string,
  context?: Record<string, string>,
  options?: RenderCrepusOptions,
): string {
  return renderToString(
    () => renderCrepusIrSolid(parseCrepus(source, context), options) as never,
  );
}

describe("renderCrepusIrSolid surface", () => {
  test("exports renderer + bridge helpers", () => {
    expect(typeof renderCrepusIrSolid).toBe("function");
    expect(typeof fromMoonshineSignal).toBe("function");
    expect(typeof createBridgedSignal).toBe("function");
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

describe("renderCrepusIrSolid", () => {
  test("preserves class tokens as class", () => {
    const out = html('div flex flex-col gap-4\n  span text-lg\n    "hi"');
    expect(out).toContain("flex flex-col gap-4");
    expect(out).toContain("text-lg");
  });

  test("emits no inline styles", () => {
    const out = html(
      'div flex flex-col gap-4 text-zinc-100 bg-zinc-950\n  span\n    "hi"',
    );
    expect(out).not.toContain("style=");
  });

  test("binds template variables from a context", () => {
    const out = html('span\n  "hello {name}"', { name: "Ada" });
    expect(out).toContain("hello Ada");
  });

  test("renders anchors with href, target and rel", () => {
    const out = html(
      'a href="https://example.com" target="_blank" rel="noopener" text-zinc-100\n  span\n    "crepuscularity"',
    );
    expect(out).toContain("<a");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener"');
    expect(out).toContain("text-zinc-100");
  });

  test("stamps the IR version and target on the root", () => {
    const out = html('span\n  "hi"');
    expect(out).toContain('data-crepus-root="true"');
    expect(out).toContain('data-crepus-target="solid"');
    expect(out).toContain(`data-crepus-ir-version="${IR_VERSION}"`);
  });

  test.each([
    ['ul\n  li\n    "a"', ["<ul", "<li"]],
    ['ol\n  li\n    "a"', ["<ol", "<li"]],
    ['button\n  "Go"', ["<button", 'type="button"', "Go"]],
    ['img src="/a.png" alt="a"', ["<img", 'src="/a.png"', 'alt="a"']],
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
    const out = renderToString(
      () => renderCrepusIrSolid({ version: IR_VERSION, root: [] }) as never,
    );
    expect(out).toContain('data-crepus-root="true"');
  });

  test("honours a custom root tag", () => {
    const out = html('span\n  "hi"', undefined, { rootTag: "section" });
    expect(out).toContain("<section");
  });
});

test("rejects unsupported and inherited View IR node kinds, including nested nodes", () => {
  for (const kind of ["unknown", "constructor", "toString", "__proto__"]) {
    const invalid = { kind };
    for (const root of [
      [invalid],
      [{ kind: "stack", axis: "column", children: [invalid] }],
    ]) {
      expect(() =>
        renderCrepusIrSolid({ version: IR_VERSION, root } as never),
      ).toThrow(new TypeError(`Unsupported View IR node kind: ${kind}`));
    }
  }
});

test("root IR factory mounts actual DOM kinds and removes its owned range", async () => {
  await import("../../react/test/dom");
  const { render } = await import("@tschk/moonshine-dom/dom");
  const { renderCrepusIrSolid: renderDOM } = await import("../src/index");
  const container = document.createElement("main");
  document.body.append(container);
  const ir = {
    version: IR_VERSION,
    root: [
      {
        kind: "stack",
        children: [
          { kind: "text", content: "<&", style: { classes: ["label"] } },
          {
            kind: "checkbox",
            label: "Enabled",
            checked: true,
            bind: "enabled",
          },
          {
            kind: "picker",
            bind: "choice",
            options: [{ value: "a", label: "A" }],
          },
          {
            kind: "if",
            condition: "false",
            thenChildren: [{ kind: "text", content: "placeholder" }],
            elseChildren: [],
          },
          {
            kind: "forEach",
            bind: "rows",
            itemName: "row",
            itemBody: [{ kind: "text", content: "item template" }],
          },
        ],
      },
    ],
  } as never;
  const stop = render(() => renderDOM(ir, { rootTag: "section" }), container);
  try {
    expect(
      container.querySelector("section")!.getAttribute("data-crepus-target"),
    ).toBe("solid");
    expect(container.querySelector("span.label")!.textContent).toBe("<&");
    expect(container.querySelector("input")!.checked).toBe(true);
    expect(container.querySelector("select")!.options[0]!.value).toBe("a");
    expect(container.querySelector("[data-crepus-if]")!.textContent).toBe(
      "placeholder",
    );
    expect(container.querySelector("[data-crepus-for-each]")!.textContent).toBe(
      "item template",
    );
    expect(() =>
      renderDOM({
        version: IR_VERSION,
        root: [{ kind: "constructor" }],
      } as never),
    ).toThrow(TypeError);
  } finally {
    stop();
    expect(container.childNodes).toHaveLength(0);
    container.remove();
  }
});
