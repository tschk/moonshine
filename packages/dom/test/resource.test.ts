import { expect, test } from "bun:test";
import { createResource } from "../src/resource";
import { renderToString } from "../src/ssr";
import {
  createComputed,
  createRoot,
  createSignal,
  onCleanup,
} from "../src/reactive";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("synchronous fetchers publish ready data immediately and refetch info", () => {
  createRoot((dispose) => {
    const calls: unknown[] = [];
    const [value, actions] = createResource((key, info) => {
      calls.push([key, info]);
      return (info.value ?? 0) + 1;
    });
    expect(value()).toBe(1);
    expect(value.state).toBe("ready");
    expect(value.loading).toBe(false);
    expect(value.latest).toBe(1);
    expect(actions.refetch("refresh")).toBe(2);
    expect(calls).toEqual([
      [true, { value: undefined, refetching: false }],
      [true, { value: 1, refetching: "refresh" }],
    ]);
    dispose();
  });
});

test("only false/null/undefined disable sources; source changes retain data", async () => {
  await createRoot(async (dispose) => {
    const [source, setSource] = createSignal<
      number | string | null | false | undefined
    >(false);
    const calls: unknown[] = [];
    const [value] = createResource(source, (key) => {
      calls.push(key);
      return key;
    });
    expect(value.state).toBe("unresolved");
    setSource(0);
    expect(value()).toBe(0);
    setSource("");
    expect(value()).toBe("");
    setSource(null);
    expect(value.state).toBe("ready");
    expect(value()).toBe("");
    setSource(undefined);
    expect(calls).toEqual([0, ""]);
    dispose();
  });
});

test("initialValue presence and pending/refreshing metadata are coherent", async () => {
  const first = deferred<string>();
  let dispose!: () => void;
  const snapshots: unknown[] = [];
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    const resource = createResource(() => first.promise, {
      initialValue: "seed",
    });
    createComputed(() =>
      snapshots.push([
        resource[0](),
        resource[0].state,
        resource[0].loading,
        resource[0].error,
      ]),
    );
    return resource;
  });
  expect(value.state).toBe("refreshing");
  expect(value.latest).toBe("seed");
  first.resolve("fresh");
  await first.promise;
  await Promise.resolve();
  expect(snapshots).toEqual([
    ["seed", "refreshing", true, undefined],
    ["fresh", "ready", false, undefined],
  ]);
  expect(actions.mutate("optimistic")).toBe("optimistic");
  expect(value()).toBe("optimistic");
  dispose();
  createRoot((stop) => {
    const [seeded] = createResource(false, () => "never", {
      initialValue: undefined,
    });
    expect(seeded.state).toBe("ready");
    stop();
  });
});

test("latest request wins; disabling and disposal ignore late success or rejection", async () => {
  const requests = new Map<number, ReturnType<typeof deferred<number>>>();
  const [source, setSource] = createSignal<number | false>(1);
  let dispose!: () => void;
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    return createResource(source, (key) => {
      const next = deferred<number>();
      requests.set(key, next);
      return next.promise;
    });
  });
  setSource(2);
  requests.get(2)!.resolve(20);
  await requests.get(2)!.promise;
  await Promise.resolve();
  requests.get(1)!.resolve(10);
  await requests.get(1)!.promise;
  await Promise.resolve();
  expect(value()).toBe(20);
  setSource(3);
  setSource(false);
  requests.get(3)!.reject(Error("stale"));
  await Promise.resolve();
  await Promise.resolve();
  expect(value()).toBe(20);
  expect(value.state).toBe("ready");
  setSource(4);
  dispose();
  requests.get(4)!.reject(Error("disposed"));
  await Promise.resolve();
  await Promise.resolve();
  expect(value.error).toBeUndefined();
  expect(value()).toBe(20);
  expect(actions.refetch()).toBe(20);
  expect(actions.mutate(99)).toBe(20);
});

test("fetch failures settle error state and reads throw, refetch recovers", async () => {
  let fail = true;
  let dispose!: () => void;
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    return createResource(async () => {
      if (fail) throw "failed";
      return 4;
    });
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(value.state).toBe("errored");
  expect(value.loading).toBe(false);
  expect(value.error?.message).toBe("failed");
  expect(value).toThrow("failed");
  expect(() => value.latest).toThrow("failed");
  actions.mutate(3);
  expect(value.state).toBe("errored");
  expect(value).toThrow("failed");
  fail = false;
  expect(await actions.refetch()).toBe(4);
  expect(value()).toBe(4);
  dispose();
});

test("fetcher reads do not become source dependencies and mutate does not cancel fetch", async () => {
  const pending = deferred<number>();
  let calls = 0;
  const [other, setOther] = createSignal(0);
  let dispose!: () => void;
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    return createResource(
      () => 1,
      () => {
        calls++;
        other();
        return pending.promise;
      },
    );
  });
  setOther(1);
  expect(calls).toBe(1);
  actions.mutate(2);
  expect(value()).toBe(2);
  expect(value.state).toBe("pending");
  pending.resolve(3);
  await pending.promise;
  await Promise.resolve();
  expect(value()).toBe(3);
  dispose();
});

test("observer exceptions do not reclassify successful fetches", async () => {
  let dispose!: () => void;
  let current = 1;
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    const pair = createResource(async () => current);
    createComputed(() => {
      if (pair[0]() === 2) throw Error("observer");
    });
    return pair;
  });
  await Promise.resolve();
  await Promise.resolve();
  current = 2;
  await expect(actions.refetch()).rejects.toThrow("observer");
  expect(value.state).toBe("ready");
  expect(value.error).toBeUndefined();
  expect(value.loading).toBe(false);
  expect(value()).toBe(2);
  dispose();
});

test("unsupported hydration/storage options reject explicitly", () => {
  for (const key of ["storage", "deferStream", "ssrLoadFrom", "onHydrated"])
    expect(() => createResource(() => 1, { [key]: true } as never)).toThrow(
      "Unsupported native resource option",
    );
});

test("derived source equality prevents redundant requests", () => {
  const [id, setId] = createSignal(1);
  let calls = 0;
  createRoot((dispose) => {
    const [value] = createResource(
      () => id() % 2,
      (key) => {
        calls++;
        return key;
      },
    );
    setId(3);
    expect(calls).toBe(1);
    expect(value()).toBe(1);
    setId(4);
    expect(calls).toBe(2);
    expect(value()).toBe(0);
    dispose();
  });
});

test("refresh keeps prior error visible but suppresses it on reads until settlement", async () => {
  let next = deferred<number>();
  let dispose!: () => void;
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    return createResource(() => next.promise, { initialValue: 1 });
  });
  next.reject(Error("previous"));
  await next.promise.catch(() => {});
  await Promise.resolve();
  expect(value).toThrow("previous");
  next = deferred<number>();
  const refresh = actions.refetch();
  expect(value.state).toBe("refreshing");
  expect(value.error?.message).toBe("previous");
  expect(value()).toBe(1);
  expect(value.latest).toBe(1);
  next.resolve(2);
  await refresh;
  expect(value.error).toBeUndefined();
  expect(value()).toBe(2);
  dispose();
});

test("synchronous errors and thenable failures settle through resource state", async () => {
  createRoot((dispose) => {
    const [value] = createResource(() => {
      throw Error("sync");
    });
    expect(value.state).toBe("errored");
    expect(value).toThrow("sync");
    dispose();
  });
  let dispose!: () => void;
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    return createResource(
      () =>
        ({
          // oxlint-disable-next-line unicorn/no-thenable -- adversarial fetcher result
          then(resolve: unknown, reject: (error: unknown) => void) {
            reject(Error("thenable"));
          },
        }) as PromiseLike<number>,
    );
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(value.error?.message).toBe("thenable");
  await actions.refetch();
  expect(value.state).toBe("errored");
  dispose();
});

test("fetcher cleanup belongs to source computations and external refetch retains ownership", () => {
  const [source, setSource] = createSignal(1);
  const cleanups: number[] = [];
  let dispose!: () => void;
  const [, actions] = createRoot((stop) => {
    dispose = stop;
    return createResource(source, (key) => {
      onCleanup(() => cleanups.push(key));
      return key;
    });
  });
  actions.refetch();
  expect(cleanups).toEqual([]);
  setSource(2);
  expect(cleanups).toEqual([1, 1]);
  dispose();
  expect(cleanups).toEqual([1, 1, 2]);
});

test("invalid options reject before reading a source", () => {
  let calls = 0;
  expect(() =>
    createResource(
      () => {
        calls++;
        return 1;
      },
      () => 1,
      { storage: true } as never,
    ),
  ).toThrow("Unsupported native resource option");
  expect(calls).toBe(0);
});

test("data-only observers do not track pending state changes", async () => {
  let dispose!: () => void;
  const history: unknown[] = [];
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    const pair = createResource(async () => 1, { initialValue: 1 });
    createComputed(() => history.push(pair[0]()));
    return pair;
  });
  await Promise.resolve();
  await Promise.resolve();
  await actions.refetch();
  expect(history).toEqual([1]);
  expect(value()).toBe(1);
  dispose();
});

test("first failure counts as settled when refetch begins", async () => {
  let dispose!: () => void;
  let next = deferred<number>();
  const [value, actions] = createRoot((stop) => {
    dispose = stop;
    return createResource(() => next.promise);
  });
  next.reject(Error("first"));
  await next.promise.catch(() => {});
  await Promise.resolve();
  next = deferred<number>();
  const pending = actions.refetch();
  expect(value.state).toBe("refreshing");
  expect(value()).toBeUndefined();
  next.resolve(2);
  await pending;
  expect(value()).toBe(2);
  dispose();
});

test("source changes inside the initial fetcher publish the latest request", () => {
  createRoot((dispose) => {
    const [source, setSource] = createSignal(1);
    const calls: number[] = [];
    const cleanups: number[] = [];
    const [value] = createResource(source, (key) => {
      calls.push(key);
      onCleanup(() => cleanups.push(key));
      if (key === 1) setSource(2);
      return key;
    });
    expect(calls).toEqual([1, 2]);
    expect(cleanups).toEqual([1]);
    expect(value()).toBe(2);
    expect(value.state).toBe("ready");
    dispose();
    expect(cleanups).toEqual([1, 2]);
  });
});

test("source changes inside later fetches publish the latest request", () => {
  createRoot((dispose) => {
    const [source, setSource] = createSignal(1);
    const calls: number[] = [];
    const cleanups: number[] = [];
    const [value] = createResource(source, (key) => {
      calls.push(key);
      onCleanup(() => cleanups.push(key));
      if (key === 3) setSource(4);
      return key;
    });
    setSource(3);
    expect(calls).toEqual([1, 3, 4]);
    expect(cleanups).toEqual([1, 3]);
    expect(value()).toBe(4);
    expect(value.state).toBe("ready");
    dispose();
    expect(cleanups).toEqual([1, 3, 4]);
  });
});

test("client resources reject SSR before invoking user callbacks", () => {
  let calls = 0;
  expect(() =>
    renderToString(() => {
      createResource(
        () => (calls++, true),
        () => (calls++, 1),
      );
      return "";
    }),
  ).toThrow("unavailable during SSR");
  expect(calls).toBe(0);
});

test("inherited initialValue keeps seeded async resources refreshing", () => {
  createRoot((dispose) => {
    const [read] = createResource(
      () => new Promise<string>(() => {}),
      Object.create({ initialValue: "seed" }),
    );
    expect(read()).toBe("seed");
    expect(read.latest).toBe("seed");
    expect(read.state).toBe("refreshing");
    expect(read.loading).toBe(true);
    dispose();
  });
});
