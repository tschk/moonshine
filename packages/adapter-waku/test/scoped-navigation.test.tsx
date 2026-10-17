import { afterEach, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMoonshineRouter,
  MoonshineRouter,
} from "@tschk/moonshine/router";
import { cleanup, click, render, setLocation } from "../../router/test/dom";
import { Link } from "../src/link";
import { useRouter, useRoute, useSetSearch_UNSTABLE } from "../src/router";

afterEach(cleanup);

function Probe() {
  const { path, query } = useRoute();
  return createElement("output", null, `${path}|${query}`);
}

test("SSR query and pathname come from the owning router", () => {
  const runtime = createMoonshineRouter("/page?owner=first");
  const output = renderToStaticMarkup(
    createElement(MoonshineRouter, {
      runtime,
      path: "/page?owner=first",
      routes: [{ path: "/page", element: createElement(Probe) }],
    }),
  );
  expect(output).toContain("/page/|owner=first");
});

test("links and router methods stay scoped with another mounted app", async () => {
  setLocation("/page");
  const first = createMoonshineRouter();
  const second = createMoonshineRouter();
  function Page() {
    const router = useRouter();
    const setSearch = useSetSearch_UNSTABLE({ from: "/page" });
    return createElement(
      "main",
      null,
      createElement(Probe),
      createElement(Link, { to: "/page?source=link" }, "link"),
      createElement(
        "button",
        { onClick: () => router.push("/page?source=push") },
        "push",
      ),
      createElement(
        "button",
        { onClick: () => router.replace("/page?source=replace") },
        "replace",
      ),
      createElement(
        "button",
        { onClick: () => setSearch({ source: "search" }) },
        "search",
      ),
    );
  }
  const container = await render(
    createElement(MoonshineRouter, {
      runtime: first,
      routes: [{ path: "/page", element: createElement(Page) }],
    }),
  );
  const other = createRoot(document.createElement("div"));
  await act(async () => {
    other.render(
      createElement(MoonshineRouter, {
        runtime: second,
        routes: [{ path: "/page", element: createElement("div") }],
      }),
    );
  });
  try {
    const untouched = second.history.peek();
    await click(container.querySelector("a")!);
    expect(first.getLocation()).toBe("/page?source=link");
    expect(second.history.peek()).toBe(untouched);
    await click(container.querySelectorAll("button")[0]!);
    expect(first.getLocation()).toBe("/page?source=push");
    expect(second.history.peek()).toBe(untouched);
    await click(container.querySelectorAll("button")[1]!);
    expect(first.getLocation()).toBe("/page?source=replace");
    expect(first.history.peek().action).toBe("REPLACE");
    expect(second.history.peek()).toBe(untouched);
    await click(container.querySelectorAll("button")[2]!);
    expect(first.getLocation()).toBe("/page/?source=search");
    expect(second.history.peek()).toBe(untouched);
  } finally {
    await act(async () => other.unmount());
  }
});
