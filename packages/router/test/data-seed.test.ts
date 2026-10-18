import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createDataRouter, type DataRouter } from "../src/data";
import { useRouteData } from "../src/data-react";
import { MoonshineRouter } from "../src/navigation";

const tick = () => Promise.resolve();

function recordingLoader() {
  const locations: string[] = [];
  const load = ({ location }: { location: string }) => {
    locations.push(location);
    return `loaded:${location}`;
  };
  return { locations, load };
}

function controlledLoader() {
  const calls: Array<{ location: string; resolve(value: string): void }> = [];
  const load = ({ location }: { location: string }) =>
    new Promise<string>((resolve) => calls.push({ location, resolve }));
  return { calls, load };
}

function observe<T>(router: DataRouter<T>) {
  const seen = [router.data.peek()];
  router.data.subscribe(() => seen.push(router.data.peek()));
  return seen;
}

test("a matching seed starts ready and never calls the loader", async () => {
  const { locations, load } = recordingLoader();
  const router = createDataRouter(load, "/a?x=1", {
    location: "/a?x=1",
    data: "seeded",
  });
  await tick();
  expect(router.data.peek()).toEqual({
    location: "/a?x=1",
    status: "ready",
    data: "seeded",
    error: undefined,
  });
  expect(locations).toEqual([]);
  router.dispose();
});

test("falsy, null and explicit undefined seeds are real ready values", async () => {
  const values: Array<number | string | boolean | null | undefined> = [
    0,
    "",
    false,
    null,
    undefined,
  ];
  for (const value of values) {
    let loads = 0;
    const router = createDataRouter<typeof value>(
      () => {
        loads++;
        return "loaded";
      },
      "/",
      { location: "/", data: value },
    );
    await tick();
    const state = router.data.peek();
    expect(state.status).toBe("ready");
    expect(state.data).toBe(value);
    expect(loads).toBe(0);
    router.dispose();
  }
});

test("a seed for another path or query is ignored and the loader fetches normally", async () => {
  for (const [path, seedLocation] of [
    ["/a", "/b"],
    ["/a?x=1", "/a?x=2"],
    ["/a?x=1", "/a"],
    ["/a", "/a?x=1"],
  ] as const) {
    const { calls, load } = controlledLoader();
    const router = createDataRouter(load, path, {
      location: seedLocation,
      data: "wrong",
    });
    const seen = observe(router);
    expect(router.data.peek()).toEqual({
      location: path,
      status: "pending",
      data: undefined,
      error: undefined,
    });
    expect(calls.map((call) => call.location)).toEqual([path]);
    calls[0]!.resolve("right");
    await tick();
    await tick();
    expect(router.data.peek()).toMatchObject({
      location: path,
      status: "ready",
      data: "right",
    });
    expect(seen.some((state) => state.data === "wrong")).toBe(false);
    router.dispose();
  }
});

test("only the canonical pathname and query match; the requested fragment is dropped", async () => {
  const accepted = recordingLoader();
  const router = createDataRouter(accepted.load, "/x/../b c?q=1#frag", {
    location: "/b%20c?q=1",
    data: "seeded",
  });
  await tick();
  expect(router.data.peek()).toMatchObject({
    location: "/b%20c?q=1",
    status: "ready",
    data: "seeded",
  });
  expect(accepted.locations).toEqual([]);
  router.dispose();

  for (const seedLocation of [
    "/b c?q=1",
    "/x/../b%20c?q=1",
    "/b%20c?q=1#frag",
  ]) {
    const { locations, load } = recordingLoader();
    const other = createDataRouter(load, "/x/../b c?q=1#frag", {
      location: seedLocation,
      data: "seeded",
    });
    await tick();
    expect(locations).toEqual(["/b%20c?q=1"]);
    expect(other.data.peek()).toMatchObject({
      status: "ready",
      data: "loaded:/b%20c?q=1",
    });
    other.dispose();
  }
});

test("invalidate keeps seeded data while pending, then publishes the next result", async () => {
  const { calls, load } = controlledLoader();
  const router = createDataRouter(load, "/a", {
    location: "/a",
    data: "seeded",
  });
  expect(calls).toHaveLength(0);
  const reload = router.invalidate();
  expect(calls.map((call) => call.location)).toEqual(["/a"]);
  expect(router.data.peek()).toMatchObject({
    location: "/a",
    status: "pending",
    data: "seeded",
  });
  calls[0]!.resolve("fresh");
  expect(await reload).toBe("fresh");
  expect(router.data.peek()).toMatchObject({ status: "ready", data: "fresh" });
  router.dispose();
});

test("navigation clears seeded data and loads; returning does not reuse the seed", async () => {
  const { calls, load } = controlledLoader();
  const router = createDataRouter(load, "/a", {
    location: "/a",
    data: "seeded",
  });
  router.navigate("/b");
  expect(router.data.peek()).toMatchObject({
    location: "/b",
    status: "pending",
    data: undefined,
  });
  expect(calls.map((call) => call.location)).toEqual(["/b"]);
  calls[0]!.resolve("b");
  await tick();
  await tick();
  router.navigate("/a");
  expect(router.data.peek()).toMatchObject({
    location: "/a",
    status: "pending",
    data: undefined,
  });
  expect(calls.map((call) => call.location)).toEqual(["/b", "/a"]);
  router.dispose();
});

test("submit revalidates a seeded router", async () => {
  let value = "loaded";
  const router = createDataRouter(() => value, "/", {
    location: "/",
    data: "seeded",
  });
  expect(
    await router.submit(() => {
      value = "after-action";
      return "saved";
    }),
  ).toBe("saved");
  expect(router.data.peek()).toMatchObject({
    status: "ready",
    data: "after-action",
  });
  router.dispose();
});

test("runtimes sharing a seed stay isolated from later seed wrapper writes", async () => {
  const seed = { location: "/a", data: "seeded" };
  const { calls, load } = controlledLoader();
  const first = createDataRouter(load, "/a", seed);
  const second = createDataRouter(load, "/a", seed);
  seed.location = "/other";
  seed.data = "mutated";
  expect(first.data.peek()).toMatchObject({ location: "/a", data: "seeded" });
  expect(second.data.peek()).toMatchObject({ location: "/a", data: "seeded" });

  first.navigate("/b");
  expect(first.getLocation()).toBe("/b");
  expect(second.getLocation()).toBe("/a");
  expect(second.data.peek()).toMatchObject({ status: "ready", data: "seeded" });
  expect(calls.map((call) => call.location)).toEqual(["/b"]);

  const reload = second.invalidate();
  expect(calls.map((call) => call.location)).toEqual(["/b", "/a"]);
  expect(second.data.peek().data).toBe("seeded");
  calls[1]!.resolve("second");
  await reload;
  expect(first.data.peek().data).toBeUndefined();
  first.dispose();
  second.dispose();
});

test("a disposed seeded router keeps its state and rejects further work", async () => {
  const { locations, load } = recordingLoader();
  const router = createDataRouter(load, "/a", {
    location: "/a",
    data: "seeded",
  });
  router.dispose();
  const state = router.data.peek();
  router.navigate("/elsewhere");
  expect(router.data.peek()).toBe(state);
  await expect(router.invalidate()).rejects.toThrow("disposed");
  await expect(router.submit(() => "never")).rejects.toThrow("disposed");
  expect(locations).toEqual([]);
});

test("SSR useRouteData renders seeded data as ready without calling the loader", () => {
  let loads = 0;
  const runtime = createDataRouter(
    () => {
      loads++;
      return "loaded";
    },
    "/",
    { location: "/", data: "seeded" },
  );
  function Probe() {
    const state = useRouteData();
    return createElement(
      "output",
      null,
      `${state.status}|${state.location}|${String(state.data)}`,
    );
  }
  expect(
    renderToStaticMarkup(
      createElement(MoonshineRouter, {
        runtime,
        path: "/",
        routes: [{ path: "/", element: createElement(Probe) }],
      }),
    ),
  ).toBe("<output>ready|/|seeded</output>");
  expect(loads).toBe(0);
  runtime.dispose();
});
