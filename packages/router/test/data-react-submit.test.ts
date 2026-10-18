import { afterEach, expect, test } from "bun:test";
import { act, createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, setLocation } from "./dom";
import { createDataRouter } from "../src/data";
import type { RouteDataContext } from "../src/data";
import {
  useRouteData,
  useRouteSubmit,
  useRouteSubmitting,
} from "../src/data-react";
import { MoonshineRouter, createMoonshineRouter } from "../src/navigation";
import type { MoonshineRouterInstance } from "../src/runtime";

afterEach(async () => {
  await cleanup();
  setLocation("/");
});

type Submit = ReturnType<typeof useRouteSubmit>;
let submit!: Submit;
let renders = 0;

function Probe() {
  const state = useRouteData();
  const busy = useRouteSubmitting();
  submit = useRouteSubmit();
  renders++;
  const error = state.error instanceof Error ? state.error.message : "-";
  return createElement(
    "output",
    null,
    `${busy}|${state.status}|${String(state.data)}|${error}`,
  );
}

function Submitting() {
  useRouteSubmitting();
  return null;
}
function Submitter() {
  useRouteSubmit();
  return null;
}

const routes = [{ path: "/", element: createElement(Probe) }];
const tree = (runtime: MoonshineRouterInstance) =>
  createElement(MoonshineRouter, { runtime, path: "/", routes });

function deferred<T>() {
  const calls: Array<{ resolve(v: T): void; reject(e: unknown): void }> = [];
  const next = () =>
    new Promise<T>((resolve, reject) => {
      calls.push({ resolve, reject });
    });
  return { calls, next };
}

function setup() {
  const loads = deferred<string>();
  const runtime = createDataRouter(() => loads.next(), "/");
  return { loads, runtime };
}

test("SSR renders submitting false and runtimes are independent", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const first = createDataRouter(() => a.next(), "/");
  const second = createDataRouter(() => b.next(), "/");
  const html = (r: MoonshineRouterInstance) => renderToStaticMarkup(tree(r));
  expect(html(first)).toContain("false|pending");
  const action = deferred<string>();
  const running = first.submit(() => action.next());
  expect(first.submitting.peek()).toBe(true);
  expect(html(first)).toContain("true|pending");
  expect(html(second)).toContain("false|pending");
  expect(second.submitting.peek()).toBe(false);
  action.calls[0]!.resolve("x");
  await Promise.resolve();
  a.calls[1]!.resolve("fresh");
  await running;
  first.dispose();
  second.dispose();
});

test("pending then success revalidates, updates data and returns the inferred result", async () => {
  const { loads, runtime } = setup();
  const container = await render(tree(runtime));
  await act(async () => {
    loads.calls[0]!.resolve("old");
  });
  expect(container.textContent).toBe("false|ready|old|-");

  const action = deferred<{ id: number }>();
  let result!: Promise<{ id: number }>;
  await act(async () => {
    result = submit(() => action.next());
  });
  expect(container.textContent).toBe("true|ready|old|-");

  await act(async () => {
    action.calls[0]!.resolve({ id: 7 });
    await Promise.resolve();
  });
  expect(loads.calls.length).toBe(2);
  await act(async () => {
    loads.calls[1]!.resolve("new");
    expect((await result).id).toBe(7);
  });
  expect(container.textContent).toBe("false|ready|new|-");
  runtime.dispose();
});

test("failed action rejects, retains data and clears pending", async () => {
  const { loads, runtime } = setup();
  const container = await render(tree(runtime));
  await act(async () => {
    loads.calls[0]!.resolve("kept");
  });
  let outcome!: Promise<unknown>;
  await act(async () => {
    outcome = submit(async () => {
      throw new Error("denied");
    }).then(
      () => "ok",
      (e: Error) => e.message,
    );
  });
  expect(await outcome).toBe("denied");
  expect(loads.calls.length).toBe(1);
  expect(container.textContent).toBe("false|ready|kept|-");
  runtime.dispose();
});

test("cooperative abort rejection from the callback rejects normally", async () => {
  const { loads, runtime } = setup();
  await render(tree(runtime));
  await act(async () => {
    loads.calls[0]!.resolve("a");
  });
  let name = "";
  await act(async () => {
    await submit(() => {
      throw new DOMException("stop", "AbortError");
    }).catch((e: Error) => {
      name = e.name;
    });
  });
  expect(name).toBe("AbortError");
  expect(runtime.submitting.peek()).toBe(false);
  runtime.dispose();
});

test("successful action with failing load returns result and exposes data.error", async () => {
  const { loads, runtime } = setup();
  const container = await render(tree(runtime));
  await act(async () => {
    loads.calls[0]!.resolve("kept");
  });
  let result!: Promise<string>;
  await act(async () => {
    result = submit(async () => "written");
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    loads.calls[1]!.reject(new Error("reload failed"));
    expect(await result).toBe("written");
  });
  expect(container.textContent).toBe("false|errored|kept|reload failed");
  runtime.dispose();
});

test("superseded successful action revalidates, returns its result and keeps newer submitting", async () => {
  const { loads, runtime } = setup();
  const container = await render(tree(runtime));
  await act(async () => {
    loads.calls[0]!.resolve("v0");
  });
  const first = deferred<string>();
  const second = deferred<string>();
  let signal!: AbortSignal;
  let r1!: Promise<string>;
  let r2!: Promise<string>;
  await act(async () => {
    r1 = submit((ctx: RouteDataContext) => {
      signal = ctx.signal;
      return first.next();
    });
    r2 = submit(() => second.next());
  });
  expect(signal.aborted).toBe(true);

  await act(async () => {
    first.calls[0]!.resolve("first-result");
    await Promise.resolve();
  });
  expect(loads.calls.length).toBe(2);
  await act(async () => {
    loads.calls[1]!.resolve("after-first");
    expect(await r1).toBe("first-result");
  });
  expect(container.textContent).toStartWith("true|");

  await act(async () => {
    second.calls[0]!.resolve("second-result");
    await Promise.resolve();
  });
  await act(async () => {
    loads.calls.at(-1)!.resolve("v1");
    expect(await r2).toBe("second-result");
  });
  expect(container.textContent).toBe("false|ready|v1|-");
  runtime.dispose();
});

test("replacing the runtime resubscribes and submit follows the new owner", async () => {
  const a = setup();
  const b = setup();
  let setOwner!: (r: MoonshineRouterInstance) => void;
  function Harness() {
    const [r, set] = useState<MoonshineRouterInstance>(a.runtime);
    setOwner = set;
    return tree(r);
  }
  const container = await render(createElement(Harness));
  await act(async () => {
    a.loads.calls[0]!.resolve("a");
    b.loads.calls[0]!.resolve("b");
  });
  const submitA = submit;
  const pendingA = deferred<string>();
  let resultA!: Promise<string>;
  await act(async () => {
    resultA = submitA(() => pendingA.next());
  });
  expect(container.textContent).toBe("true|ready|a|-");

  await act(async () => {
    setOwner(b.runtime);
  });
  expect(container.textContent).toBe("false|ready|b|-");
  expect(submit).not.toBe(submitA);

  const before = renders;
  await act(async () => {
    pendingA.calls[0]!.resolve("done");
    await Promise.resolve();
  });
  await act(async () => {
    a.loads.calls[1]!.resolve("a-refreshed");
    await resultA;
  });
  expect(renders).toBe(before);

  const pendingB = deferred<string>();
  let resultB!: Promise<string>;
  await act(async () => {
    resultB = submit(() => pendingB.next());
  });
  expect(container.textContent).toBe("true|ready|b|-");
  expect(a.runtime.submitting.peek()).toBe(false);
  await act(async () => {
    pendingB.calls[0]!.resolve("ok");
    await Promise.resolve();
  });
  await act(async () => {
    b.loads.calls[1]!.resolve("b-refreshed");
    await resultB;
  });
  expect(container.textContent).toBe("false|ready|b-refreshed|-");
  a.runtime.dispose();
  b.runtime.dispose();
});

test("navigation-only routers fail with actionable errors", () => {
  const runtime = createMoonshineRouter("/");
  const mount = (c: () => null) =>
    renderToStaticMarkup(
      createElement(MoonshineRouter, {
        runtime,
        path: "/",
        routes: [{ path: "/", element: createElement(c) }],
      }),
    );
  expect(() => mount(Submitting)).toThrow(/createDataRouter/);
  expect(() => mount(Submitter)).toThrow(/createDataRouter/);
});

test("unmount stops updates and dispose makes submit reject", async () => {
  const { loads, runtime } = setup();
  await render(tree(runtime));
  await act(async () => {
    loads.calls[0]!.resolve("a");
  });
  const held = submit;
  const action = deferred<string>();
  let running!: Promise<string>;
  await act(async () => {
    running = held(() => action.next());
  });
  await cleanup();
  const before = renders;
  await act(async () => {
    action.calls[0]!.resolve("late");
    await Promise.resolve();
  });
  loads.calls.at(-1)!.resolve("late-data");
  await running;
  expect(renders).toBe(before);

  runtime.dispose();
  let message = "";
  await held(async () => "x").catch((e: Error) => {
    message = e.message;
  });
  expect(message).toBe("Data router is disposed");
});
