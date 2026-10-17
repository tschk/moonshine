import { afterEach, expect, test } from "bun:test";
import { act, createElement, useState } from "react";
import {
  createMoonshineRouter,
  MoonshineRouter,
} from "@tschk/moonshine/router";
import { cleanup, click, render, setLocation } from "../../router/test/dom";
import { Link, Navigate } from "../src/link";
import { useLocation, useNavigate, useRouterState } from "../src/navigation";

afterEach(cleanup);

test("TanStack links, hooks and POP preserve reactive history state", async () => {
  setLocation("/page");
  const runtime = createMoonshineRouter();
  function Page() {
    const location = useLocation();
    const selectedState = useRouterState({
      select: (value) => value.location.state,
    });
    const navigate = useNavigate();
    return createElement(
      "main",
      null,
      createElement(
        "output",
        null,
        JSON.stringify({
          pathname: location.pathname,
          state: location.state,
          selectedState,
        }),
      ),
      createElement(Link, { to: "/page", state: { source: "link" } }, "link"),
      createElement(
        "button",
        {
          onClick: () =>
            navigate({
              to: "/page",
              search: { tab: "two" },
              replace: true,
              state: { source: "hook" },
            }),
        },
        "navigate",
      ),
    );
  }
  const container = await render(
    createElement(MoonshineRouter, {
      runtime,
      routes: [{ path: "/page", element: createElement(Page) }],
    }),
  );
  const read = () =>
    JSON.parse(container.querySelector("output")!.textContent!);
  await click(container.querySelector("a")!);
  expect(read()).toEqual({
    pathname: "/page",
    state: { source: "link" },
    selectedState: { source: "link" },
  });
  expect(container.querySelector("a")!.hasAttribute("state")).toBe(false);
  await click(container.querySelector("button")!);
  expect(read()).toEqual({
    pathname: "/page",
    state: { source: "hook" },
    selectedState: { source: "hook" },
  });
  await act(async () => {
    window.history.replaceState({ source: "pop" }, "", "/page");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(read()).toEqual({
    pathname: "/page",
    state: { source: "pop" },
    selectedState: { source: "pop" },
  });
});

test("navigation stays with the owning router when another app mounts", async () => {
  setLocation("/page");
  const first = createMoonshineRouter();
  const second = createMoonshineRouter();
  const redirectState = { source: "redirect" };
  function Page() {
    const navigate = useNavigate();

    const [redirect, setRedirect] = useState(false);
    return createElement(
      "main",
      null,
      createElement(Link, { to: "/page", state: { source: "link" } }, "link"),
      createElement(
        "button",
        { onClick: () => navigate({ to: "/page", state: { source: "hook" } }) },
        "navigate",
      ),

      createElement("button", { onClick: () => setRedirect(true) }, "redirect"),
      redirect
        ? createElement(Navigate, { to: "/page", state: redirectState })
        : null,
    );
  }
  const container = await render(
    createElement(MoonshineRouter, {
      runtime: first,
      routes: [{ path: "/page", element: createElement(Page) }],
    }),
  );
  await render(
    createElement(MoonshineRouter, {
      runtime: second,
      routes: [{ path: "/page", element: createElement("div") }],
    }),
  );
  const untouched = second.history.peek();
  await click(container.querySelector("a")!);
  expect(first.history.peek().state).toEqual({ source: "link" });
  expect(second.history.peek()).toBe(untouched);
  await click(container.querySelectorAll("button")[0]!);
  expect(first.history.peek().state).toEqual({ source: "hook" });
  expect(second.history.peek()).toBe(untouched);

  await click(container.querySelectorAll("button")[1]!);
  expect(first.history.peek().state).toEqual({ source: "redirect" });
  expect(second.history.peek()).toBe(untouched);
});
