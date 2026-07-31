import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { getLocation } from "@tschk/moonshine/router";
import Link from "../src/link";
import { click, render, setLocation, cleanup } from "./dom";

function anchor(container: HTMLElement): HTMLAnchorElement {
  const node = container.querySelector("a");
  if (!node) throw new Error("Link did not render an anchor");
  return node;
}

describe("next/link", () => {
  afterEach(cleanup);

  beforeEach(() => {
    setLocation("/start");
    for (const tag of document.head.querySelectorAll("link[rel=prefetch]")) {
      tag.remove();
    }
  });

  test("renders an anchor carrying href and passthrough props", async () => {
    const container = await render(
      createElement(
        Link,
        { href: "/about", className: "nav", id: "about-link" },
        "About",
      ),
    );
    const a = anchor(container);
    expect(a.getAttribute("href")).toBe("/about");
    expect(a.className).toBe("nav");
    expect(a.id).toBe("about-link");
    expect(a.textContent).toBe("About");
  });

  test("serializes an object href with a query", async () => {
    const container = await render(
      createElement(Link, {
        href: { pathname: "/search", query: { q: "moon", page: "2" } },
      }),
    );
    expect(anchor(container).getAttribute("href")).toBe(
      "/search?q=moon&page=2",
    );
  });

  test("internal click navigates through moonshine's router", async () => {
    const container = await render(
      createElement(Link, { href: "/about" }, "About"),
    );
    const event = await click(anchor(container));
    expect(event.defaultPrevented).toBe(true);
    expect(window.location.pathname).toBe("/about");
    expect(getLocation()).toBe("/about");
  });

  test("replace navigates without growing the history stack", async () => {
    const before = window.history.length;
    const container = await render(
      createElement(Link, { href: "/replaced", replace: true }),
    );
    await click(anchor(container));
    expect(window.location.pathname).toBe("/replaced");
    expect(window.history.length).toBe(before);
  });

  test("runs a user onClick before navigating", async () => {
    const seen: string[] = [];
    const container = await render(
      createElement(Link, {
        href: "/tracked",
        onClick: () => seen.push("user"),
      }),
    );
    await click(anchor(container));
    expect(seen).toEqual(["user"]);
    expect(window.location.pathname).toBe("/tracked");
  });

  test("a user onClick that preventDefaults cancels navigation", async () => {
    const container = await render(
      createElement(Link, {
        href: "/blocked",
        onClick: (event) => event.preventDefault(),
      }),
    );
    await click(anchor(container));
    expect(window.location.pathname).toBe("/start");
  });

  describe("does not intercept", () => {
    test("absolute external URLs", async () => {
      const container = await render(
        createElement(Link, { href: "https://example.org/docs" }),
      );
      const event = await click(anchor(container));
      expect(event.defaultPrevented).toBe(false);
      expect(window.location.pathname).toBe("/start");
    });

    test("protocol-relative URLs", async () => {
      const container = await render(
        createElement(Link, { href: "//cdn.example.org/x" }),
      );
      expect((await click(anchor(container))).defaultPrevented).toBe(false);
    });

    test("mailto: and other schemes", async () => {
      const container = await render(
        createElement(Link, { href: "mailto:hi@example.org" }),
      );
      expect((await click(anchor(container))).defaultPrevented).toBe(false);
    });

    test("hash-only links", async () => {
      const container = await render(createElement(Link, { href: "#section" }));
      const event = await click(anchor(container));
      expect(event.defaultPrevented).toBe(false);
      expect(window.location.pathname).toBe("/start");
    });

    test("target=_blank", async () => {
      const container = await render(
        createElement(Link, { href: "/about", target: "_blank" }),
      );
      const event = await click(anchor(container));
      expect(event.defaultPrevented).toBe(false);
      expect(window.location.pathname).toBe("/start");
    });

    for (const modifier of [
      "metaKey",
      "ctrlKey",
      "shiftKey",
      "altKey",
    ] as const) {
      test(`clicks held with ${modifier}`, async () => {
        const container = await render(createElement(Link, { href: "/about" }));
        const event = await click(anchor(container), { [modifier]: true });
        expect(event.defaultPrevented).toBe(false);
        expect(window.location.pathname).toBe("/start");
      });
    }

    test("middle clicks", async () => {
      const container = await render(createElement(Link, { href: "/about" }));
      const event = await click(anchor(container), { button: 1 });
      expect(event.defaultPrevented).toBe(false);
      expect(window.location.pathname).toBe("/start");
    });
  });

  describe("prefetch", () => {
    function prefetchHrefs(): string[] {
      return [...document.head.querySelectorAll("link[rel=prefetch]")].map(
        (tag) => tag.getAttribute("href") ?? "",
      );
    }

    test("hovering emits a browser prefetch hint once", async () => {
      const container = await render(
        createElement(Link, { href: "/hover-target" }),
      );
      const a = anchor(container);
      a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(prefetchHrefs()).toEqual(["/hover-target"]);
    });

    test("prefetch={false} emits nothing", async () => {
      const container = await render(
        createElement(Link, { href: "/no-warm", prefetch: false }),
      );
      anchor(container).dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
      expect(prefetchHrefs()).toEqual([]);
    });

    test("external hrefs are never prefetched", async () => {
      const container = await render(
        createElement(Link, { href: "https://example.org/far" }),
      );
      anchor(container).dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
      expect(prefetchHrefs()).toEqual([]);
    });
  });

  describe("scroll", () => {
    let jumps: number;

    beforeEach(() => {
      jumps = 0;
      (globalThis as { scrollTo: unknown }).scrollTo = () => {
        jumps++;
      };
    });

    test("scrolls to the top when the path changes", async () => {
      const container = await render(
        createElement(Link, { href: "/elsewhere" }),
      );
      await click(anchor(container));
      expect(jumps).toBe(1);
    });

    test("stays put when only the query changes", async () => {
      setLocation("/list");
      const container = await render(
        createElement(Link, { href: "/list?page=2" }),
      );
      await click(anchor(container));
      expect(window.location.search).toBe("?page=2");
      expect(jumps).toBe(0);
    });

    test("scroll={false} suppresses the jump", async () => {
      const container = await render(
        createElement(Link, { href: "/elsewhere", scroll: false }),
      );
      await click(anchor(container));
      expect(jumps).toBe(0);
    });
  });
});
