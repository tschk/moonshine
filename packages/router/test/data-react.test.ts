import { afterEach, expect, test } from "bun:test";
import { act, createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, setLocation } from "./dom";
import { createDataRouter } from "../src/data";
import { useRouteData } from "../src/data-react";
import { MoonshineRouter, createMoonshineRouter } from "../src/navigation";
import type { MoonshineRouterInstance } from "../src/runtime";

afterEach(async () => {
  await cleanup();
  setLocation("/");
});

let renders = 0;

function Probe() {
  const state = useRouteData();
  renders++;
  const error = state.error instanceof Error ? state.error.message : "-";
  return createElement(
    "output",
    null,
    `${state.status}|${state.location}|${String(state.data)}|${error}`,
  );
}

const routes = [{ path: "/", element: createElement(Probe) }];

function tree(runtime: MoonshineRouterInstance) {
  return createElement(MoonshineRouter, { runtime, path: "/", routes });
}

function controlledLoader() {
  const calls: Array<{
    resolve(value: string): void;
    reject(error: Error): void;
  }> = [];
  const load = () =>
    new Promise<string>((resolve, reject) => {
      calls.push({ resolve, reject });
    });
  return { calls, load };
}

test("SSR renders pending state before the loader settles", () => {
  const { load } = controlledLoader();
  const runtime = createDataRouter(load, "/");
  expect(renderToStaticMarkup(tree(runtime))).toBe(
    "<output>pending|/|undefined|-</output>",
  );
  runtime.dispose();
});

test("SSR renders ready data", async () => {
  const runtime = createDataRouter(() => "one", "/");
  await runtime.invalidate();
  expect(renderToStaticMarkup(tree(runtime))).toBe(
    "<output>ready|/|one|-</output>",
  );
  runtime.dispose();
});

test("SSR renders loader errors as state instead of throwing", async () => {
  const runtime = createDataRouter(() => {
    throw new Error("boom");
  }, "/");
  await runtime.invalidate().catch(() => {});
  expect(renderToStaticMarkup(tree(runtime))).toBe(
    "<output>errored|/|undefined|boom</output>",
  );
  runtime.dispose();
});

test("SSR runtimes are isolated from each other", async () => {
  const a = createDataRouter(() => "a", "/");
  const b = createDataRouter(() => "b", "/");
  await a.invalidate();
  expect(renderToStaticMarkup(tree(a))).toContain("ready|/|a|");
  expect(renderToStaticMarkup(tree(b))).not.toContain("|a|");
  a.dispose();
  b.dispose();
});

test("a router without a data runtime is rejected", () => {
  const navigationOnly = createMoonshineRouter("/");
  expect(() => renderToStaticMarkup(tree(navigationOnly))).toThrow(
    "data runtime",
  );
  expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(
    "data runtime",
  );
});

test("mounted consumers follow invalidate, settle and error", async () => {
  const { calls, load } = controlledLoader();
  const runtime = createDataRouter(load, "/");
  const container = await render(tree(runtime));
  expect(container.textContent).toBe("pending|/|undefined|-");

  await act(async () => {
    calls[0]!.resolve("one");
  });
  expect(container.textContent).toBe("ready|/|one|-");

  let reload!: Promise<unknown>;
  await act(async () => {
    reload = runtime.invalidate();
  });
  expect(container.textContent).toBe("pending|/|one|-");

  await act(async () => {
    calls[1]!.reject(new Error("offline"));
    await reload.catch(() => {});
  });
  expect(container.textContent).toBe("errored|/|one|offline");
  runtime.dispose();
});

test("same-location reload retains data while navigation clears it", async () => {
  const { calls, load } = controlledLoader();
  const runtime = createDataRouter(load, "/");
  const container = await render(tree(runtime));
  await act(async () => {
    calls[0]!.resolve("one");
  });

  await act(async () => {
    void runtime.invalidate();
  });
  expect(container.textContent).toBe("pending|/|one|-");
  await act(async () => {
    calls[1]!.resolve("one");
  });

  await act(async () => {
    runtime.navigate("/next");
  });
  expect(container.textContent).toBe("pending|/next|undefined|-");
  await act(async () => {
    calls[2]!.resolve("next");
  });
  expect(container.textContent).toBe("ready|/next|next|-");
  runtime.dispose();
});

test("switching the owning runtime resubscribes to the new source", async () => {
  const a = controlledLoader();
  const b = controlledLoader();
  const first = createDataRouter(a.load, "/");
  const second = createDataRouter(b.load, "/");
  let setOwner!: (runtime: MoonshineRouterInstance) => void;
  function Harness() {
    const [runtime, set] = useState<MoonshineRouterInstance>(first);
    setOwner = set;
    return tree(runtime);
  }
  const container = await render(createElement(Harness));
  await act(async () => {
    a.calls[0]!.resolve("first");
  });
  expect(container.textContent).toBe("ready|/|first|-");

  await act(async () => {
    setOwner(second);
  });
  expect(container.textContent).toBe("pending|/|undefined|-");

  const before = renders;
  await act(async () => {
    void first.invalidate();
  });
  expect(renders).toBe(before);
  expect(container.textContent).toBe("pending|/|undefined|-");

  await act(async () => {
    b.calls[0]!.resolve("second");
  });
  expect(container.textContent).toBe("ready|/|second|-");
  first.dispose();
  second.dispose();
});

test("unmounted consumers receive no late publish", async () => {
  const { calls, load } = controlledLoader();
  const runtime = createDataRouter(load, "/");
  await render(tree(runtime));
  await cleanup();
  const before = renders;
  await act(async () => {
    calls[0]!.resolve("late");
  });
  expect(runtime.data.peek().status).toBe("ready");
  expect(renders).toBe(before);
  runtime.dispose();
});

test("disposal stops publishing to mounted consumers", async () => {
  const { calls, load } = controlledLoader();
  const runtime = createDataRouter(load, "/");
  const container = await render(tree(runtime));
  runtime.dispose();
  await act(async () => {
    calls[0]!.resolve("late");
  });
  expect(container.textContent).toBe("pending|/|undefined|-");
});
