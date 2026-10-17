import { afterEach, expect, test } from "bun:test";
import { createElement, act } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, render, setLocation } from "./dom";
import {
  createMoonshineRouter,
  MoonshineRouter,
  navigate,
  useLocation,
  useHistory,
} from "../src/navigation";

afterEach(cleanup);

function ServerProbe() {
  return createElement(
    "output",
    null,
    JSON.stringify([useLocation(), useHistory()]),
  );
}

test("SSR reads each router's location and never reuses fallback history", () => {
  navigate("/private", { state: { secret: "prior request" } });
  expect(renderToString(createElement(ServerProbe))).not.toContain(
    "prior request",
  );
  for (const name of ["alice", "bob"]) {
    const path = `/account?owner=${name}`;
    const runtime = createMoonshineRouter(path);
    runtime.history.set({ action: "REPLACE", state: { owner: name } });
    const html = renderToString(
      createElement(MoonshineRouter, {
        runtime,
        path,
        routes: [{ path: "/account", element: createElement(ServerProbe) }],
      }),
    );
    expect(html).toContain(path);
    expect(html).toContain(`&quot;owner&quot;:&quot;${name}&quot;`);
    expect(html).not.toContain("prior request");
  }
});

test("navigation stores PUSH and REPLACE state without changing location semantics", () => {
  setLocation("/start");
  window.history.replaceState({ initial: true }, "", "/start");
  const router = createMoonshineRouter();
  expect(router.history.peek()).toEqual({
    action: "POP",
    state: { initial: true },
  });
  router.navigate("/next?tab=one#section", { state: { from: "start" } });
  expect(window.history.state).toEqual({ from: "start" });
  expect(router.getLocation()).toBe("/next?tab=one");
  expect(router.history.peek()).toEqual({
    action: "PUSH",
    state: { from: "start" },
  });
  router.navigate("/next?tab=two", { replace: true, state: false });
  expect(router.history.peek()).toEqual({ action: "REPLACE", state: false });
  router.navigate("/plain");
  expect(window.history.state).toBeNull();
});

test("state-only navigation notifies history subscribers with consistent location", () => {
  setLocation("/same");
  const router = createMoonshineRouter();
  const observed: unknown[] = [];
  const stop = router.history.subscribe(() =>
    observed.push([router.getLocation(), router.history.peek()]),
  );
  router.navigate("/same", { state: 1 });
  router.navigate("/same", { replace: true, state: 2 });
  expect(observed).toEqual([
    ["/same", { action: "PUSH", state: 1 }],
    ["/same", { action: "REPLACE", state: 2 }],
  ]);
  stop();
});

test("mounted popstate synchronization restores browser state and POP action", async () => {
  setLocation("/start");
  const router = createMoonshineRouter();
  await render(createElement(MoonshineRouter, { routes: [], runtime: router }));
  await act(async () => router.navigate("/next", { state: "next" }));
  await act(async () => {
    window.history.replaceState({ restored: true }, "", "/start");
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { restored: true } }),
    );
  });
  expect(router.getLocation()).toBe("/start");
  expect(router.history.peek()).toEqual({
    action: "POP",
    state: { restored: true },
  });
});

test("unmounting routers in mount order never restores an unmounted runtime", async () => {
  const first = createMoonshineRouter("/first");
  const second = createMoonshineRouter("/second");
  for (const [runtime, path] of [
    [first, "/first"],
    [second, "/second"],
  ] as const) {
    await render(createElement(MoonshineRouter, { routes: [], runtime, path }));
  }
  await act(async () => navigate("/active"));
  expect(second.getLocation()).toBe("/active");
  await cleanup();
  navigate("/after-unmount");
  expect(first.getLocation()).toBe("/first");
  expect(second.getLocation()).toBe("/active");
});
