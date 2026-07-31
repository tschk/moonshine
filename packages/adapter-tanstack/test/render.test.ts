import { describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, type LinkRenderState } from "../src/link";
import { Outlet, OutletProvider } from "../src/outlet";
import { useLocation, useRouterState, useSearch } from "../src/navigation";

function html(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

describe("Link", () => {
  test("renders an anchor with an interpolated href", () => {
    const out = html(
      createElement(Link, { to: "/posts/$id", params: { id: "9" } }, "Post"),
    );
    expect(out).toContain('href="/posts/9"');
    expect(out).toContain(">Post</a>");
  });

  test("serialises search values", () => {
    expect(
      html(createElement(Link, { to: "/a", search: { page: 2 } })),
    ).toContain('href="/a?page=2"');
  });

  test("marks the active route", () => {
    const out = html(createElement(Link, { to: "/" }, "Home"));
    expect(out).toContain('data-status="active"');
    expect(out).toContain('aria-current="page"');
  });

  test("is inactive for another route", () => {
    const out = html(createElement(Link, { to: "/other" }, "Other"));
    expect(out).not.toContain("data-status");
  });

  test("applies activeProps when active", () => {
    const out = html(
      createElement(Link, { to: "/", activeProps: { title: "here" } }, "Home"),
    );
    expect(out).toContain('title="here"');
  });

  test("accepts children as a render callback", () => {
    const out = html(
      createElement(Link, { to: "/" }, (({ isActive }: LinkRenderState) =>
        isActive ? "on" : "off") as never),
    );
    expect(out).toContain("on");
  });

  test("does not leak router-only props into the DOM", () => {
    const out = html(
      createElement(Link, { to: "/a", preload: "viewport", replace: true }),
    );
    expect(out).not.toContain("preload");
    expect(out).not.toContain("replace");
  });
});

describe("Outlet", () => {
  test("renders nothing without a provider", () => {
    expect(html(createElement(Outlet))).toBe("");
  });

  test("renders the provided element", () => {
    const out = html(
      createElement(
        OutletProvider,
        { value: createElement("p", null, "child") },
        createElement("main", null, createElement(Outlet)),
      ),
    );
    expect(out).toBe("<main><p>child</p></main>");
  });
});

describe("hooks", () => {
  test("useLocation exposes a parsed location", () => {
    function Probe(): ReactNode {
      const location = useLocation();
      return createElement(
        "code",
        null,
        `${location.pathname}|${location.searchStr}`,
      );
    }
    expect(html(createElement(Probe))).toBe("<code>/|</code>");
  });

  test("useSearch returns a decoded record", () => {
    function Probe(): ReactNode {
      return createElement("code", null, JSON.stringify(useSearch()));
    }
    expect(html(createElement(Probe))).toBe("<code>{}</code>");
  });

  test("useRouterState reports an idle router and supports select", () => {
    function Probe(): ReactNode {
      const status = useRouterState({ select: (s) => s.status });
      return createElement("code", null, status);
    }
    expect(html(createElement(Probe))).toBe("<code>idle</code>");
  });
});
