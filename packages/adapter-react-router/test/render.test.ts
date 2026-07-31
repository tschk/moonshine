import { describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link, NavLink, type NavLinkRenderState } from "../src/link";
import { Outlet, OutletProvider, useOutletContext } from "../src/outlet";
import {
  useHref,
  useLocation,
  useNavigationType,
  useSearchParams,
} from "../src/navigation";

function html(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

describe("Link", () => {
  test("renders an anchor with the resolved href", () => {
    expect(html(createElement(Link, { to: "/about" }, "About"))).toBe(
      '<a href="/about">About</a>',
    );
  });

  test("resolves an object `to`", () => {
    expect(
      html(createElement(Link, { to: { pathname: "/x", search: "q=1" } })),
    ).toContain('href="/x?q=1"');
  });

  test("forwards arbitrary anchor props", () => {
    const out = html(
      createElement(Link, { to: "/a", className: "c", id: "i" }, "t"),
    );
    expect(out).toContain('class="c"');
    expect(out).toContain('id="i"');
  });

  test("does not leak router-only props into the DOM", () => {
    const out = html(
      createElement(Link, { to: "/a", replace: true, prefetch: "none" }),
    );
    expect(out).not.toContain("replace");
    expect(out).not.toContain("prefetch");
  });
});

describe("NavLink", () => {
  test("marks the active route with aria-current", () => {
    const out = html(createElement(NavLink, { to: "/" }, "Home"));
    expect(out).toContain('aria-current="page"');
    expect(out).toContain('class="active"');
  });

  test("is inactive for a non-matching route", () => {
    const out = html(createElement(NavLink, { to: "/other" }, "Other"));
    expect(out).not.toContain("aria-current");
  });

  test("accepts a className callback", () => {
    const out = html(
      createElement(
        NavLink,
        { to: "/", className: ({ isActive }) => (isActive ? "on" : "off") },
        "Home",
      ),
    );
    expect(out).toContain('class="on"');
  });

  test("accepts children as a render callback", () => {
    const out = html(
      createElement(NavLink, { to: "/" }, (({
        isActive,
      }: NavLinkRenderState) => (isActive ? "yes" : "no")) as never),
    );
    expect(out).toContain("yes");
  });

  test("end matches exactly", () => {
    const out = html(createElement(NavLink, { to: "/deep", end: true }, "x"));
    expect(out).not.toContain("aria-current");
  });
});

describe("Outlet", () => {
  test("renders nothing without a provider", () => {
    expect(html(createElement(Outlet))).toBe("");
  });

  test("renders the provided child element", () => {
    const out = html(
      createElement(
        OutletProvider,
        { value: createElement("p", null, "child") },
        createElement("main", null, createElement(Outlet)),
      ),
    );
    expect(out).toBe("<main><p>child</p></main>");
  });

  test("useOutletContext reads the provider context", () => {
    function Child(): ReactNode {
      return createElement("i", null, useOutletContext<string>());
    }
    const out = html(
      createElement(
        OutletProvider,
        { value: createElement(Child), context: "ctx" },
        createElement(Outlet),
      ),
    );
    expect(out).toBe("<i>ctx</i>");
  });
});

describe("hooks", () => {
  test("useLocation returns a location object", () => {
    function Probe(): ReactNode {
      const location = useLocation();
      return createElement("code", null, JSON.stringify(location));
    }
    const out = html(createElement(Probe)).replaceAll("&quot;", '"');
    expect(out).toContain('"pathname":"/"');
    expect(out).toContain('"state":null');
  });

  test("useSearchParams returns params and a setter", () => {
    function Probe(): ReactNode {
      const [params, setParams] = useSearchParams();
      return createElement(
        "code",
        null,
        `${params instanceof URLSearchParams}:${typeof setParams}`,
      );
    }
    expect(html(createElement(Probe))).toContain("true:function");
  });

  test("useHref resolves a relative path against the location", () => {
    function Probe(): ReactNode {
      return createElement("code", null, useHref("child"));
    }
    expect(html(createElement(Probe))).toBe("<code>/child</code>");
  });

  test("useNavigationType reports POP", () => {
    function Probe(): ReactNode {
      return createElement("code", null, useNavigationType());
    }
    expect(html(createElement(Probe))).toBe("<code>POP</code>");
  });
});
