import { describe, expect, test, mock } from "bun:test";
import { createResource } from "../src/resource";

describe("createResource", () => {
  test("fetches and exposes status", async () => {
    const r = createResource(async () => 7, { immediate: false });
    expect(r()).toBeUndefined();
    await r.refetch();
    expect(r()).toBe(7);
    expect(r.status()).toBe("ready");
    expect(r.loading()).toBe(false);
  });

  test("captures errors", async () => {
    const r = createResource(
      async () => {
        throw new Error("nope");
      },
      { immediate: false },
    );
    await r.refetch();
    expect(r.error()?.message).toBe("nope");
    expect(r.status()).toBe("errored");
  });

  test("captures non-Error objects and invokes onError", async () => {
    let capturedError: Error | undefined;
    const r = createResource(
      async () => {
        throw "string error";
      },
      {
        immediate: false,
        onError: (err) => {
          capturedError = err;
        },
      },
    );
    await r.refetch();
    expect(r.error()?.message).toBe("string error");
    expect(r.status()).toBe("errored");
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError?.message).toBe("string error");
  });

  test("immediate fetching (default)", async () => {
    const fetcher = mock(async () => "data");
    const r = createResource(fetcher);
    // Should be pending initially while fetch is in-flight
    expect(r.status()).toBe("pending");
    expect(r.loading()).toBe(true);

    // Wait for microtasks to flush
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalled();
    expect(r()).toBe("data");
    expect(r.status()).toBe("ready");
    expect(r.loading()).toBe(false);
  });

  test("initial option", async () => {
    const r = createResource(async () => "new", {
      initial: "initial",
      immediate: false,
    });

    // Should start ready with initial value
    expect(r()).toBe("initial");
    expect(r.status()).toBe("ready");
    expect(r.loading()).toBe(false);

    await r.refetch();
    expect(r()).toBe("new");
  });

  test("error recovery", async () => {
    let shouldFail = true;
    const r = createResource(
      async () => {
        if (shouldFail) throw new Error("fail");
        return "success";
      },
      { immediate: false },
    );

    await r.refetch();
    expect(r.status()).toBe("errored");
    expect(r.error()).toBeDefined();

    shouldFail = false;
    await r.refetch();
    expect(r.status()).toBe("ready");
    expect(r.error()).toBeUndefined();
    expect(r()).toBe("success");
  });

  test("peek and subscribe", async () => {
    const r = createResource(async () => "value", { immediate: false });

    let subCalls = 0;
    const unsub = r.subscribe(() => {
      subCalls++;
    });

    expect(r.peek()).toBeUndefined();
    await r.refetch();
    expect(r.peek()).toBe("value");

    // Subscription should have been called when data changed
    expect(subCalls).toBe(1);

    unsub();
  });

  test("concurrent refetch keeps the latest result", async () => {
    let resolveFirst!: (value: string) => void;
    let calls = 0;
    const r = createResource(
      () => {
        calls++;
        if (calls === 1) {
          return new Promise<string>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve("second");
      },
      { immediate: false },
    );

    const first = r.refetch();
    const second = r.refetch();
    await second;
    resolveFirst("first");
    await first;

    expect(r()).toBe("second");
    expect(r.status()).toBe("ready");
    expect(r.loading()).toBe(false);
    expect(r.error()).toBeUndefined();
  });
});

test("resource observers see atomic pending and successful data metadata", async () => {
  const r = createResource(async () => "fresh", {
    initial: "old",
    immediate: false,
  });
  const snapshots: unknown[] = [];
  const observe = () =>
    snapshots.push([
      r.peek(),
      r.status.peek(),
      r.loading.peek(),
      r.error.peek(),
    ]);
  const subscriptions = [
    r.subscribe(observe),
    r.status.subscribe(observe),
    r.loading.subscribe(observe),
  ];
  try {
    await r.refetch();
    expect(snapshots).toEqual([
      ["old", "pending", true, undefined],
      ["fresh", "ready", false, undefined],
    ]);
  } finally {
    for (const unsubscribe of subscriptions) unsubscribe();
  }
});

test("successful fetch stays ready when a data observer throws", async () => {
  const onError = mock();
  const r = createResource(async () => "fresh", { immediate: false, onError });
  const failure = new Error("observer failed");
  r.subscribe(() => {
    throw failure;
  });
  const terminal: unknown[] = [];
  r.loading.subscribe(() => {
    if (!r.loading.peek())
      terminal.push([r.peek(), r.status.peek(), r.error.peek()]);
  });
  await expect(r.refetch()).rejects.toBe(failure);
  expect(r.peek()).toBe("fresh");
  expect(r.status.peek()).toBe("ready");
  expect(r.loading.peek()).toBe(false);
  expect(r.error.peek()).toBeUndefined();
  expect(onError).not.toHaveBeenCalled();
  expect(terminal).toEqual([["fresh", "ready", undefined]]);
});

test("failed fetch preserves data and publishes atomic failure before onError", async () => {
  const failure = new Error("fetch failed");
  const snapshots: unknown[] = [];
  const r = createResource<string>(
    async () => {
      throw failure;
    },
    {
      initial: "old",
      immediate: false,
      onError(error) {
        snapshots.push([
          "onError",
          r.peek(),
          r.status.peek(),
          r.loading.peek(),
          error,
        ]);
      },
    },
  );
  r.error.subscribe(() =>
    snapshots.push([
      "observer",
      r.peek(),
      r.status.peek(),
      r.loading.peek(),
      r.error.peek(),
    ]),
  );
  await expect(r.refetch()).resolves.toBeUndefined();
  expect(snapshots).toEqual([
    ["observer", "old", "errored", false, failure],
    ["onError", "old", "errored", false, failure],
  ]);
});

test("stale fetch rejection cannot replace latest success or invoke onError", async () => {
  let rejectFirst!: (error: Error) => void;
  let calls = 0;
  const onError = mock();
  const r = createResource(
    () =>
      ++calls === 1
        ? new Promise<string>((_resolve, reject) => {
            rejectFirst = reject;
          })
        : Promise.resolve("latest"),
    { immediate: false, onError },
  );
  const first = r.refetch();
  await r.refetch();
  rejectFirst(new Error("obsolete failure"));
  expect(await first).toBe("latest");
  expect([r.peek(), r.status.peek(), r.loading.peek(), r.error.peek()]).toEqual(
    ["latest", "ready", false, undefined],
  );
  expect(onError).not.toHaveBeenCalled();
});
