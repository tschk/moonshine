import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { renderCrepusIr } from "../src/render";

describe("renderCrepusIr", () => {
  test("renders text / stack / button / sparkline", () => {
    const el = renderCrepusIr({
      version: 1,
      root: [
        {
          kind: "stack",
          axis: "column",
          children: [
            { kind: "text", content: "Hello" },
            { kind: "button", label: "Click", onClick: "doThing" },
            { kind: "sparkline", values: [1, 2, 3], width: 40, height: 10 },
          ],
        },
      ],
    });

    const html = renderToStaticMarkup(el);
    expect(html).toContain("data-crepus-root");
    expect(html).toContain("Hello");
    expect(html).toContain("Click");
    expect(html).toContain('data-onclick="doThing"');
    expect(html).toContain('data-crepus-kind="sparkline"');
    expect(html).toContain("<path");
  });

  test("renders expanded View IR kinds", () => {
    const html = renderToStaticMarkup(
      renderCrepusIr({
        root: [
          {
            kind: "stack",
            children: [
              { kind: "scroll", children: [{ kind: "text", content: "scrolled" }] },
              { kind: "toggle", label: "Dark", value: true, onChange: "setDark" },
              { kind: "checkbox", label: "Agree", value: false },
              { kind: "progress", value: 0.4, max: 1 },
              { kind: "meter", value: 0.6, min: 0, max: 1 },
              { kind: "badge", label: "NEW", tone: "accent" },
              { kind: "divider" },
              { kind: "spacer", size: 12 },
              { kind: "image", src: "/x.png", alt: "x" },
              {
                kind: "if",
                condition: true,
                then: [{ kind: "text", content: "yes" }],
                else: [{ kind: "text", content: "no" }],
              },
              {
                kind: "forEach",
                items: [1, 2],
                itemTemplate: { kind: "badge", label: "item" },
              },
              {
                kind: "list",
                children: [
                  { kind: "listItem", label: "One" },
                  { kind: "listItem", label: "Two" },
                ],
              },
            ],
          },
        ],
      }),
    );

    for (const kind of [
      "scroll",
      "toggle",
      "checkbox",
      "progress",
      "meter",
      "badge",
      "divider",
      "spacer",
      "image",
      "if",
      "forEach",
      "list",
      "listItem",
    ]) {
      expect(html).toContain(`data-crepus-kind="${kind}"`);
    }
    expect(html).toContain("scrolled");
    expect(html).toContain("yes");
    expect(html).toContain("One");
    expect(html).not.toContain(">no<");
  });

  test("unknown kinds render a stub", () => {
    const html = renderToStaticMarkup(
      renderCrepusIr({
        root: [{ kind: "picker", options: [] }],
      }),
    );
    expect(html).toContain('data-crepus-kind="picker"');
    expect(html).toContain("data-crepus-unknown");
  });
});
