import { expect, test } from "bun:test";
import { createDataRouter } from "../src/data";

const tick = () => Promise.resolve();

test("navigation aborts old loads and ignores stale results; invalidation reloads", async () => {
  const calls: Array<{
    location: string;
    signal: AbortSignal;
    resolve: (value: string) => void;
  }> = [];
  const router = createDataRouter(
    ({ location, signal }) =>
      new Promise<string>((resolve) =>
        calls.push({ location, signal, resolve }),
      ),
    "/a",
  );
  router.navigate("/b?x=1");
  expect(calls[0]!.signal.aborted).toBe(true);
  calls[1]!.resolve("new");
  await tick();
  calls[0]!.resolve("old");
  await tick();
  expect(router.data.peek()).toMatchObject({
    location: "/b?x=1",
    status: "ready",
    data: "new",
  });
  const reload = router.invalidate();
  expect(router.data.peek().data).toBe("new");
  calls[2]!.resolve("fresh");
  expect(await reload).toBe("fresh");
  router.dispose();
});

test("load failures are observable and recover; disposed work cannot publish", async () => {
  let fail = true;
  const router = createDataRouter(() => {
    if (fail) throw new Error("offline");
    return "ok";
  });
  await tick();
  expect(router.data.peek().status).toBe("errored");
  fail = false;
  await router.invalidate();
  expect(router.data.peek().data).toBe("ok");
  router.dispose();
  const state = router.data.peek();
  router.navigate("/elsewhere");
  expect(router.data.peek()).toBe(state);
  await expect(router.invalidate()).rejects.toThrow("disposed");
});

test("actions revalidate after success and clear pending state after failure", async () => {
  let value = 1;
  const router = createDataRouter(() => value);
  await tick();
  expect(
    await router.submit(() => {
      value = 2;
      return "saved";
    }),
  ).toBe("saved");
  expect(router.data.peek().data).toBe(2);
  await expect(
    router.submit(() => {
      throw new Error("write failed");
    }),
  ).rejects.toThrow("write failed");
  expect(router.submitting.peek()).toBe(false);
  router.dispose();
});

test("navigation cancels actions and disposal prevents late loader publication", async () => {
  const router = createDataRouter(({ location }) => location, "/a");
  await tick();
  let finish!: () => void;
  let signal!: AbortSignal;
  const action = router.submit((context) => {
    signal = context.signal;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  router.navigate("/b");
  await tick();
  finish();
  await action;
  expect(signal.aborted).toBe(true);
  expect(router.submitting.peek()).toBe(false);
  expect(router.data.peek().data).toBe("/b");
  router.dispose();
  let resolve!: (value: number) => void;
  const late = createDataRouter(
    () =>
      new Promise<number>((done) => {
        resolve = done;
      }),
  );
  late.dispose();
  const state = late.data.peek();
  resolve(42);
  await tick();
  expect(late.data.peek()).toBe(state);
});

test("a successful action keeps its result when revalidation fails", async () => {
  let fail = false;
  const router = createDataRouter(() => {
    if (fail) throw Error("reload failed");
    return 1;
  });
  await tick();
  expect(
    await router.submit(() => {
      fail = true;
      return "saved";
    }),
  ).toBe("saved");
  expect(router.data.peek().status).toBe("errored");
  expect(router.submitting.peek()).toBe(false);
  router.dispose();
});

test("same-location history and fragment changes do not reload data", async () => {
  let calls = 0;
  const router = createDataRouter(() => ++calls, "/a");
  await tick();
  router.navigate("/a#details", { state: { tab: 1 } });
  expect(calls).toBe(1);
  router.navigate("/a?tab=2");
  await tick();
  expect(calls).toBe(2);
  router.dispose();
});

test("successful superseded actions refresh data without clearing a newer submission", async () => {
  let loads = 0;
  const router = createDataRouter(() => ++loads, "/");
  await tick();
  const actions: Array<{
    signal: AbortSignal;
    resolve: (value: string) => void;
  }> = [];
  const action = ({ signal }: { signal: AbortSignal }) =>
    new Promise<string>((resolve) => actions.push({ signal, resolve }));
  const first = router.submit(action);
  const second = router.submit(action);
  expect(actions[0]!.signal.aborted).toBe(true);
  actions[0]!.resolve("old");
  await first;
  expect(router.submitting.peek()).toBe(true);
  expect(loads).toBe(2);
  actions[1]!.resolve("new");
  expect(await second).toBe("new");
  expect(loads).toBe(3);
  expect(router.submitting.peek()).toBe(false);
  router.dispose();
});

test("an abort listener can start a replacement load without an outer stale commit", async () => {
  let calls = 0;
  const router = createDataRouter(({ signal }) => {
    const value = ++calls;
    if (value === 1)
      signal.addEventListener(
        "abort",
        () => {
          void router.invalidate();
        },
        { once: true },
      );
    return value;
  }, "/");
  await tick();
  await router.invalidate();
  await tick();
  expect(calls).toBe(2);
  expect(router.data.peek().data).toBe(2);
  router.dispose();
});

test("superseded invalidation waits for the current load even if an old loader stalls", async () => {
  const calls: Array<(value: number) => void> = [];
  const router = createDataRouter(
    () => new Promise<number>((resolve) => calls.push(resolve)),
    "/",
  );
  const first = router.invalidate();
  const second = router.invalidate();
  let settled = false;
  void first.then(() => {
    settled = true;
  });
  await tick();
  expect(settled).toBe(false);
  calls[2]!(3);
  expect(await first).toBe(3);
  expect(await second).toBe(3);
  router.dispose();
});

test("disposal settles every invalidation waiter without waiting for ignored aborts", async () => {
  const router = createDataRouter(() => new Promise<number>(() => {}), "/");
  const first = router.invalidate();
  const second = router.invalidate();
  router.dispose();
  expect(await first).toBeUndefined();
  expect(await second).toBeUndefined();
  expect(router.submitting.peek()).toBe(false);
});

test("late rejections from superseded or disposed loads are ignored", async () => {
  const rejects: Array<(error: Error) => void> = [];
  const router = createDataRouter(
    () =>
      new Promise<string>((_, r) => {
        rejects.push(r);
      }),
    "/a",
  );

  router.navigate("/b");
  rejects[0]!(new Error("late error"));

  await tick();
  expect(router.data.peek().status).toBe("pending");

  rejects[1]!(new Error("real error"));

  await tick();
  expect(router.data.peek().status).toBe("errored");

  router.dispose();

  const rejects2: Array<(error: Error) => void> = [];
  const router2 = createDataRouter(
    () =>
      new Promise<string>((_, r) => {
        rejects2.push(r);
      }),
    "/c",
  );

  router2.dispose();
  rejects2[0]!(new Error("late error 2"));
  await tick();
  expect(router2.data.peek().status).not.toBe("errored");
});
