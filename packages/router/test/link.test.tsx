import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isExternal, Link, safeHref } from "../src/navigation";
import { click, render, setLocation, cleanup } from "./dom";

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

describe("isExternal", () => {
  test("a scheme, a protocol-relative host, a fragment or a target is the browser's", () => {
    expect(isExternal("https://github.com/me")).toBe(true);
    expect(isExternal("mailto:me@example.com")).toBe(true);
    expect(isExternal("tel:+15551234")).toBe(true);
    expect(isExternal("//cdn.example.com/x")).toBe(true);
    expect(isExternal("#section")).toBe(true);
    expect(isExternal("/about", "_blank")).toBe(true);
  });

  test("a same-document path is the router's", () => {
    expect(isExternal("/about")).toBe(false);
    expect(isExternal("/about", "_self")).toBe(false);
    expect(isExternal("/a?b=1")).toBe(false);
  });
});

describe("Link and external targets", () => {
  // The regression: safeHref *allows* https/mailto/tel — it only strips schemes
  // that could execute — and Link took that as permission to intercept them.
  // preventDefault ran, navigate rebuilt the URL against the current origin, and
  // `https://github.com/me` became a push to `/me` on this app. The href looked
  // correct the whole time, so it only surfaced as a 404 on click.
  afterEach(cleanup);
  beforeEach(() => setLocation("/start"));

  async function clicked(href: string, target?: string) {
    const container = await render(createElement(Link, { href, target }, "go"));
    const node = container.querySelector("a");
    if (!node) throw new Error("Link did not render an anchor");
    return click(node);
  }

  test("leaves an external URL to the browser", async () => {
    expect((await clicked("https://github.com/me")).defaultPrevented).toBe(
      false,
    );
  });

  test("leaves mailto and tel to the browser", async () => {
    expect((await clicked("mailto:me@example.com")).defaultPrevented).toBe(
      false,
    );
    expect((await clicked("tel:+15551234")).defaultPrevented).toBe(false);
  });

  test("leaves an explicit target to the browser", async () => {
    expect((await clicked("/about", "_blank")).defaultPrevented).toBe(false);
  });

  test("still intercepts a same-document path", async () => {
    expect((await clicked("/about")).defaultPrevented).toBe(true);
  });
});
