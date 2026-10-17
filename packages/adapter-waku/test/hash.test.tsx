import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { act, createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMoonshineRouter,
  MoonshineRouter,
} from "@tschk/moonshine/router";
import { render, cleanup, setLocation } from "../../router/test/dom";
import { useRoute } from "../src/router";
function Probe() {
  return createElement("output", null, useRoute().hash || "empty");
}
const hashTree = (
  runtime: ReturnType<typeof createMoonshineRouter>,
  element = createElement(Probe),
) =>
  createElement(MoonshineRouter, {
    runtime,
    path: "/page?q=1",
    routes: [{ path: "/page", element }],
  });

let restoreHistory: () => void;
beforeEach(() => {
  // HappyDOM emits hashchange for push/replaceState; Chromium does not. Suppress only those exact queued pairs.
  const programmatic = new Map<string, number>();
  const ignoreHistoryHash = (event: HashChangeEvent) => {
    const pair = JSON.stringify([event.oldURL, event.newURL]);
    const count = programmatic.get(pair) ?? 0;
    if (count) {
      if (count === 1) programmatic.delete(pair);
      else programmatic.set(pair, count - 1);
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("hashchange", ignoreHistoryHash, true);
  const spies = (["pushState", "replaceState"] as const).map((method) => {
    const original = window.history[method].bind(window.history);
    return spyOn(window.history, method).mockImplementation(
      (state, title, url) => {
        const before = window.location.href;
        original(state, title, url);
        const after = window.location.href;
        if (new URL(before).hash !== new URL(after).hash) {
          const pair = JSON.stringify([before, after]);
          programmatic.set(pair, (programmatic.get(pair) ?? 0) + 1);
        }
      },
    );
  });
  restoreHistory = () => {
    for (const spy of spies) spy.mockRestore();
    window.removeEventListener("hashchange", ignoreHistoryHash, true);
  };
});
afterEach(async () => {
  await cleanup();
  // Let the mock deliver its already-queued history events while the precise filter is installed.
  await new Promise((resolve) => setTimeout(resolve, 0));
  restoreHistory();
});
test("hash events and owning runtime writes update without changing path/query", async () => {
  setLocation("/page?q=1");
  const first = createMoonshineRouter("/page?q=1"),
    second = createMoonshineRouter("/page?q=1");
  const tree = (runtime: typeof first) =>
    createElement(MoonshineRouter, {
      runtime,
      path: "/page?q=1",
      routes: [{ path: "/page", element: createElement(Probe) }],
    });
  const one = await render(tree(first));
  const two = await render(tree(second));
  await act(async () => first.navigate("#first"));
  expect(one.textContent).toBe("#first");
  expect(two.textContent).toBe("empty");
  expect(first.getLocation()).toBe("/page?q=1");
  expect(second.getLocation()).toBe("/page?q=1");
  await act(async () => {
    window.history.pushState(null, "", "/page?q=1#second");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(one.textContent).toBe("#second");
  expect(two.textContent).toBe("#second");
  await act(async () => {
    window.history.replaceState(null, "", "/page?q=1#back");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(one.textContent).toBe("#back");
  expect(two.textContent).toBe("#back");
});
test("SSR hash stays empty even when browser has a fragment", () => {
  setLocation("/page#browser");
  expect(renderToStaticMarkup(createElement(Probe))).toBe(
    "<output>empty</output>",
  );
  expect(
    renderToStaticMarkup(hashTree(createMoonshineRouter("/page?q=1#server"))),
  ).toBe("<output>empty</output>");
});
test("unmount removes hash listeners and owning fragment subscription", async () => {
  setLocation("/page");
  const runtime = createMoonshineRouter("/page");
  const remove = spyOn(window, "removeEventListener");
  const subscribe = runtime.fragment.subscribe;
  let active = 0;
  runtime.fragment.subscribe = (fn) => {
    active++;
    const stop = subscribe(fn);
    return () => {
      active--;
      stop();
    };
  };
  try {
    await render(
      createElement(MoonshineRouter, {
        runtime,
        path: "/page",
        routes: [{ path: "/page", element: createElement(Probe) }],
      }),
    );
    expect(active).toBe(1);
    await cleanup();
    expect(active).toBe(0);
    expect(remove.mock.calls.some(([type]) => type === "hashchange")).toBe(
      true,
    );
    expect(remove.mock.calls.some(([type]) => type === "popstate")).toBe(true);
  } finally {
    remove.mockRestore();
    runtime.fragment.subscribe = subscribe;
  }
});

test("unrelated renders and new consumers retain their owning runtime fragment", async () => {
  setLocation("/page?q=1");
  const first = createMoonshineRouter("/page?q=1#initial-one"),
    second = createMoonshineRouter("/page?q=1#initial-two");
  let rerender!: () => void;
  function Rerenderable() {
    const [revision, setRevision] = useState(0);
    rerender = () => setRevision(revision + 1);
    return createElement(Probe);
  }
  const one = await render(hashTree(first));
  const two = await render(hashTree(second, createElement(Rerenderable)));
  expect(one.textContent).toBe("#initial-one");
  expect(two.textContent).toBe("#initial-two");
  await act(async () => first.navigate("#first"));
  await act(async () => rerender());
  expect(one.textContent).toBe("#first");
  expect(two.textContent).toBe("#initial-two");
  const another = await render(hashTree(second));
  expect(another.textContent).toBe("#initial-two");
  await cleanup();
  first.navigate("#unmounted-first");
  second.navigate("#unmounted-second");
  first.navigate("#latest-browser");
  const remounted = await render(hashTree(second));
  expect(remounted.textContent).toBe("#unmounted-second");
  expect(second.getLocation()).toBe("/page?q=1");
});

test("direct browser fragment assignment still reaches all mounted runtimes", async () => {
  setLocation("/page");
  const first = createMoonshineRouter("/page#first"),
    second = createMoonshineRouter("/page#second");
  const tree = (runtime: typeof first) =>
    createElement(MoonshineRouter, {
      runtime,
      path: "/page",
      routes: [{ path: "/page", element: createElement(Probe) }],
    });
  const one = await render(tree(first)),
    two = await render(tree(second));
  await act(async () => {
    window.location.hash = "assigned";
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(one.textContent).toBe("#assigned");
  expect(two.textContent).toBe("#assigned");
});
