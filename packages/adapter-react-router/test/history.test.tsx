import { afterEach, expect, test } from "bun:test";
import { act, createElement, useState } from "react";
import {
  createMoonshineRouter,
  MoonshineRouter,
} from "@tschk/moonshine/router";
import { cleanup, click, render, setLocation } from "../../router/test/dom";
import { Link, Navigate } from "../src/link";
import {
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from "../src/navigation";

afterEach(cleanup);

function FirstPage() {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  const [, setSearch] = useSearchParams();
  return createElement(
    "main",
    null,
    createElement(
      "output",
      null,
      JSON.stringify({
        pathname: location.pathname,
        state: location.state,
        action,
      }),
    ),
    createElement(Link, { to: "/page", state: { source: "link" } }, "link"),
    createElement(
      "button",
      {
        onClick: () =>
          navigate("/page", { replace: true, state: { source: "hook" } }),
      },
      "navigate",
    ),
    createElement(
      "button",
      {
        onClick: () =>
          setSearch({ tab: "two" }, { state: { source: "search" } }),
      },
      "search",
    ),
  );
}

const redirectState = { source: "redirect" };
function SecondPage() {
  const navigate = useNavigate();
  const [, setSearch] = useSearchParams();
  const [redirect, setRedirect] = useState(false);
  return createElement(
    "main",
    null,
    createElement(Link, { to: "/page", state: { source: "link" } }, "link"),
    createElement(
      "button",
      { onClick: () => navigate("/page", { state: { source: "hook" } }) },
      "navigate",
    ),
    createElement(
      "button",
      {
        onClick: () =>
          setSearch({ tab: "two" }, { state: { source: "search" } }),
      },
      "search",
    ),
    createElement("button", { onClick: () => setRedirect(true) }, "redirect"),
    redirect
      ? createElement(Navigate, { to: "/page", state: redirectState })
      : null,
  );
}

test("React Router links, hooks and POP preserve reactive history state", async () => {
  setLocation("/page");
  const runtime = createMoonshineRouter();
  const container = await render(
    createElement(MoonshineRouter, {
      runtime,
      routes: [{ path: "/page", element: createElement(FirstPage) }],
    }),
  );
  const read = () =>
    JSON.parse(container.querySelector("output")!.textContent!);
  await click(container.querySelector("a")!);
  expect(read()).toEqual({
    pathname: "/page",
    state: { source: "link" },
    action: "PUSH",
  });
  await click(container.querySelectorAll("button")[0]!);
  expect(read()).toEqual({
    pathname: "/page",
    state: { source: "hook" },
    action: "REPLACE",
  });
  await click(container.querySelectorAll("button")[1]!);
  expect(read()).toEqual({
    pathname: "/page",
    state: { source: "search" },
    action: "PUSH",
  });
  await act(async () => {
    window.history.replaceState({ source: "pop" }, "", "/page");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(read()).toEqual({
    pathname: "/page",
    state: { source: "pop" },
    action: "POP",
  });
});

test("navigation stays with the owning router when another app mounts", async () => {
  setLocation("/page");
  const first = createMoonshineRouter();
  const second = createMoonshineRouter();
  const container = await render(
    createElement(MoonshineRouter, {
      runtime: first,
      routes: [{ path: "/page", element: createElement(SecondPage) }],
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
  expect(first.history.peek().state).toEqual({ source: "search" });
  expect(second.history.peek()).toBe(untouched);
  await click(container.querySelectorAll("button")[2]!);
  expect(first.history.peek().state).toEqual({ source: "redirect" });
  expect(second.history.peek()).toBe(untouched);
});
