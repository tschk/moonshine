import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, safeHref } from "../src/navigation";

function hrefOf(href: string): string {
  const html = renderToStaticMarkup(createElement(Link, { href }, "go"));
  return /href="([^"]*)"/.exec(html)?.[1] ?? "";
}

describe("safeHref", () => {
  test("neutralizes script-bearing schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("JavaScript:alert(1)")).toBe("#");
    expect(safeHref("  javascript:alert(1)")).toBe("#");
    expect(safeHref("java\tscript:alert(1)")).toBe("#");
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBe("#");
    expect(safeHref("vbscript:msgbox(1)")).toBe("#");
    expect(safeHref("")).toBe("#");
  });

  test("preserves relative and known-safe absolute targets", () => {
    expect(safeHref("/users/1")).toBe("/users/1");
    expect(safeHref("users/1")).toBe("users/1");
    expect(safeHref("?q=1")).toBe("?q=1");
    expect(safeHref("#anchor")).toBe("#anchor");
    expect(safeHref("//example.com/x")).toBe("//example.com/x");
    expect(safeHref("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
  });
});

describe("Link", () => {
  test("does not render a script-bearing href", () => {
    expect(hrefOf("javascript:alert(1)")).toBe("#");
    expect(hrefOf("/ok")).toBe("/ok");
  });
});
