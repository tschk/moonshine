import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import {
  createMoonshineRouter,
  MoonshineRouter,
} from "@tschk/moonshine/router";
import { cleanup, click, render, setLocation } from "../../router/test/dom";
import { Link, type LinkProps } from "../src/link";

afterEach(cleanup);
async function fixture(props: LinkProps) {
  setLocation("/page");
  const runtime = createMoonshineRouter();
  const container = await render(
    createElement(MoonshineRouter, {
      runtime,
      routes: [{ path: "/page", element: createElement(Link, props, "go") }],
    }),
  );
  return { runtime, anchor: container.querySelector("a")! };
}

test.each<LinkProps>([
  { to: "https://other.example/account" },
  { to: "mailto:hello@example.com" },
  { to: "//other.example/account" },
  { to: "#section" },
  { to: "/next", target: "_blank" },
  { to: "/next", target: "named-window" },
  { to: "/file", download: "" },
  { to: "/file", download: true },
])("browser owns $to with target/download preserved", async (props) => {
  const { runtime, anchor } = await fixture({
    ...props,
    unstable_prefetchOnEnter: true,
    unstable_prefetchOnView: true,
  });
  const prior = document.head.querySelectorAll('link[rel="prefetch"]').length;
  anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  expect((await click(anchor)).defaultPrevented).toBe(false);
  expect(runtime.getLocation()).toBe("/page");
  expect(document.head.querySelectorAll('link[rel="prefetch"]').length).toBe(
    prior,
  );
});

test("internal links navigate and prefetch; user cancellation and modifiers win", async () => {
  const { runtime, anchor } = await fixture({
    to: "/next",
    target: "_self",
    download: false,
  });
  expect((await click(anchor, { ctrlKey: true })).defaultPrevented).toBe(false);
  expect(runtime.getLocation()).toBe("/page");
  expect((await click(anchor)).defaultPrevented).toBe(true);
  expect(runtime.getLocation()).toBe("/next");
  expect(
    document.head.querySelector('link[rel="prefetch"][href="/next"]'),
  ).not.toBeNull();
  await cleanup();
  let calls = 0;
  const canceled = await fixture({
    to: "/canceled",
    onClick: (e) => {
      calls++;
      e.preventDefault();
    },
  });
  await click(canceled.anchor);
  expect(calls).toBe(1);
  expect(canceled.runtime.getLocation()).toBe("/page");
});

test("a link to a fragment on the page scrolls to it instead of the top", async () => {
  const { runtime, anchor } = await fixture({ to: "/page#pricing" });
  const target = document.createElement("section");
  target.id = "pricing";
  document.body.append(target);
  const scrolled: string[] = [];
  target.scrollIntoView = () => scrolled.push("pricing");
  const scrollTo = window.scrollTo;
  window.scrollTo = (() => scrolled.push("top")) as typeof window.scrollTo;
  try {
    await click(anchor);
    expect(runtime.getLocation()).toBe("/page");
    expect(scrolled).toEqual(["pricing"]);
  } finally {
    window.scrollTo = scrollTo;
    target.remove();
  }
});
