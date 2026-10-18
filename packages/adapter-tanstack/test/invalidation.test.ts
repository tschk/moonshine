import { afterEach, expect, test } from "bun:test";
import { act, createElement } from "react";
import { cleanup, render } from "../../router/test/dom";
afterEach(cleanup);
import { renderToStaticMarkup } from "react-dom/server";
import {
  MoonshineRouter,
  createMoonshineRouter,
} from "@tschk/moonshine/router";
import { createDataRouter } from "@tschk/moonshine-router/data";
import {
  useRouter,
  useRouterState,
  type RouterInstance,
} from "../src/navigation";

test("invalidation delegates to the owning data runtime", async () => {
  let calls = 0;
  const runtime = createDataRouter(() => ++calls, "/");
  await Promise.resolve();
  let router!: RouterInstance;
  function Probe() {
    router = useRouter();
    return null;
  }
  renderToStaticMarkup(
    createElement(MoonshineRouter, {
      runtime,
      path: "/",
      routes: [{ path: "/", element: createElement(Probe) }],
    }),
  );
  await router.invalidate();
  expect(runtime.data.peek().data).toBe(2);
  runtime.dispose();
});

test("navigation-only invalidation rejects instead of silently succeeding", async () => {
  let router!: RouterInstance;
  function Probe() {
    router = useRouter();
    return null;
  }
  renderToStaticMarkup(
    createElement(MoonshineRouter, {
      runtime: createMoonshineRouter("/"),
      path: "/",
      routes: [{ path: "/", element: createElement(Probe) }],
    }),
  );
  await expect(router.invalidate()).rejects.toThrow("data router");
});

test("loading state follows data ownership and loader failures stay in data state", async () => {
  let reject!: (error: Error) => void;
  const runtime = createDataRouter(
    () =>
      new Promise<number>((_, fail) => {
        reject = fail;
      }),
    "/",
  );
  let router!: RouterInstance;
  function Probe() {
    router = useRouter();
    const state = useRouterState();
    return createElement("p", null, `${state.status}:${state.isLoading}`);
  }
  const tree = () =>
    createElement(MoonshineRouter, {
      runtime,
      path: "/",
      routes: [{ path: "/", element: createElement(Probe) }],
    });
  expect(renderToStaticMarkup(tree())).toContain("pending:true");
  const reload = router.invalidate();
  reject(Error("offline"));
  await reload;
  expect(runtime.data.peek().status).toBe("errored");
  expect(renderToStaticMarkup(tree())).toContain("idle:false");
  runtime.dispose();
});

test("mounted loading consumers update on reload and settlement", async () => {
  let resolve!: (value: number) => void;
  const runtime = createDataRouter(
    () =>
      new Promise<number>((done) => {
        resolve = done;
      }),
    "/",
  );
  let router!: RouterInstance;
  function Probe() {
    router = useRouter();
    const state = useRouterState();
    return createElement("output", null, `${state.status}:${state.isLoading}`);
  }
  const container = await render(
    createElement(MoonshineRouter, {
      runtime,
      path: "/",
      routes: [{ path: "/", element: createElement(Probe) }],
    }),
  );
  expect(container.textContent).toBe("pending:true");
  await act(async () => {
    resolve(1);
  });
  expect(container.textContent).toBe("idle:false");
  let reload!: Promise<void>;
  await act(async () => {
    reload = router.invalidate();
  });
  expect(container.textContent).toBe("pending:true");
  await act(async () => {
    resolve(2);
    await reload;
  });
  expect(container.textContent).toBe("idle:false");
  runtime.dispose();
});
