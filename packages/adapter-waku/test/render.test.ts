import { describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Link } from "../src/link";
import {
  useNavigationStatus_UNSTABLE,
  useParams_UNSTABLE,
  useRoute,
  useRouter_UNSTABLE,
  useSearch_UNSTABLE,
} from "../src/router";

function html(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

describe("Link", () => {
  test("renders an anchor with the resolved href", () => {
    expect(html(createElement(Link, { to: "/about" }, "About"))).toBe(
      '<a href="/about">About</a>',
    );
  });

  test("serialises an object `to`", () => {
    expect(
      html(createElement(Link, { to: { pathname: "/a", search: { p: 1 } } })),
    ).toContain('href="/a?p=1"');
  });

  test("does not leak router-only props into the DOM", () => {
    const out = html(
      createElement(Link, {
        to: "/a",
        scroll: false,
        unstable_instant: true,
        unstable_prefetchOnView: true,
      }),
    );
    expect(out).not.toContain("unstable_");
    expect(out).not.toContain("scroll");
  });

  test("provides navigation status to its children", () => {
    function Status(): ReactNode {
      return createElement(
        "em",
        null,
        String(useNavigationStatus_UNSTABLE().pending),
      );
    }
    expect(html(createElement(Link, { to: "/a" }, createElement(Status)))).toBe(
      '<a href="/a"><em>false</em></a>',
    );
  });

  test("navigation status is empty outside a Link", () => {
    function Status(): ReactNode {
      return createElement(
        "em",
        null,
        JSON.stringify(useNavigationStatus_UNSTABLE()),
      );
    }
    expect(html(createElement(Status))).toBe("<em>{}</em>");
  });
});

describe("hooks", () => {
  test("useRoute reports Waku's route shape", () => {
    function Probe(): ReactNode {
      const route = useRoute();
      return createElement(
        "code",
        null,
        `${route.path}|${route.query}|${route.hash}`,
      );
    }
    expect(html(createElement(Probe))).toBe("<code>/||</code>");
  });

  test("useRouter_UNSTABLE spreads the route and adds navigation methods", () => {
    function Probe(): ReactNode {
      const router = useRouter_UNSTABLE();
      return createElement(
        "code",
        null,
        `${router.path}|${typeof router.push}|${typeof router.prefetch}`,
      );
    }
    expect(html(createElement(Probe))).toBe("<code>/|function|function</code>");
  });

  test("useParams_UNSTABLE returns null for a non-matching from", () => {
    function Probe(): ReactNode {
      return createElement(
        "code",
        null,
        JSON.stringify(useParams_UNSTABLE({ from: "/posts/[slug]" })),
      );
    }
    expect(html(createElement(Probe))).toBe("<code>null</code>");
  });

  test("useSearch_UNSTABLE returns params for a matching from", () => {
    function Probe(): ReactNode {
      const search = useSearch_UNSTABLE({ from: "/" });
      return createElement(
        "code",
        null,
        String(search instanceof URLSearchParams),
      );
    }
    expect(html(createElement(Probe))).toBe("<code>true</code>");
  });
});
