import { expect, test } from "bun:test";
import { writable, readable, derived, get } from "../src/store";

test("writable subscribes synchronously and starts/stops once per subscriber cohort", () => {
  let starts = 0,
    stops = 0;
  const state = writable(1, (set, update) => {
    starts++;
    set(2);
    update((n) => n + 1);
    return () => stops++;
  });
  const a: number[] = [],
    b: number[] = [];
  const first = state.subscribe((value) => a.push(value)),
    second = state.subscribe((value) => b.push(value));
  expect([a, b, starts]).toEqual([[3], [3], 1]);
  state.update((n) => n + 1);
  expect([a, b]).toEqual([
    [3, 4],
    [3, 4],
  ]);
  first();
  first();
  expect(stops).toBe(0);
  second();
  expect(stops).toBe(1);
  expect(get(state)).toBe(3);
  expect([starts, stops]).toEqual([2, 2]);
});

test("safe equality suppresses equal primitives/NaN and notifies same object/function", () => {
  const object = { n: 1 },
    fn = () => 1;
  const state = writable<unknown>(NaN);
  let calls = 0;
  const stop = state.subscribe(() => calls++);
  state.set(NaN);
  state.set(0);
  state.set(-0);
  state.set(object);
  state.set(object);
  state.set(fn);
  state.set(fn);
  expect(calls).toBe(6);
  stop();
});

test("global queue invalidates before delivery and preserves reentrant cross-store order", () => {
  const a = writable(0),
    b = writable(0);
  const events: string[] = [];
  const first = a.subscribe(
    (value) => {
      events.push(`a1:${value}`);
      if (value === 1) b.set(1);
    },
    () => events.push("invalidate-a1"),
  );
  const second = a.subscribe(
    (value) => events.push(`a2:${value}`),
    () => events.push("invalidate-a2"),
  );
  const third = b.subscribe(
    (value) => events.push(`b:${value}`),
    () => events.push("invalidate-b"),
  );
  events.length = 0;
  a.set(1);
  expect(events).toEqual([
    "invalidate-a1",
    "invalidate-a2",
    "a1:1",
    "invalidate-b",
    "a2:1",
    "b:1",
  ]);
  first();
  second();
  third();
});

test("automatic single/multi derivation is lazy and avoids diamond glitches", () => {
  let runs = 0;
  const source = writable(1);
  const a = derived(source, (value) => {
    runs++;
    return value * 2;
  });
  const b = derived(source, (value) => value * 3);
  const combined = derived([a, b] as const, ([x, y]) => x + y);
  expect(runs).toBe(0);
  const values: number[] = [];
  const stop = combined.subscribe((value) => values.push(value));
  source.set(2);
  expect(values).toEqual([5, 10]);
  expect(runs).toBe(2);
  stop();
  source.set(3);
  expect(runs).toBe(2);
  expect(get(combined)).toBe(15);
});

test("manual derivation supports set/update and cleanup before replacement and final stop", () => {
  const input = writable(1);
  const events: string[] = [];
  let write!: (value: number) => void;
  const output = derived(
    input,
    (value, set, update) => {
      events.push(`run:${value}`);
      write = set;
      set(value);
      update((previous) => previous + 1);
      return () => events.push(`cleanup:${value}`);
    },
    0,
  );
  const values: number[] = [];
  const stop = output.subscribe((value) => values.push(value));
  expect(values).toEqual([2]);
  write(9);
  input.set(2);
  expect(values).toEqual([2, 9, 2, 3]);
  expect(events).toEqual(["run:1", "cleanup:1", "run:2"]);
  stop();
  expect(events.at(-1)).toBe("cleanup:2");
});

test("derived handles more than 32 inputs and empty tuples", () => {
  const inputs = Array.from({ length: 40 }, (_, index) => writable(index));
  const output = derived(inputs, (values) => values.reduce((a, b) => a + b, 0));
  const values: number[] = [];
  const stop = output.subscribe((value) => values.push(value));
  inputs[33]!.set(100);
  expect(values).toEqual([780, 847]);
  stop();
  expect(get(derived([] as const, () => 42))).toBe(42);
});

test("queued callbacks after unsubscribe do not restart stopped derived work", () => {
  const source = writable(0);
  let runs = 0;
  const output = derived(source, (value) => {
    runs++;
    return value;
  });
  let stop = () => {};
  const first = source.subscribe((value) => {
    if (value === 1) stop();
  });
  stop = output.subscribe(() => {});
  source.set(1);
  expect(runs).toBe(1);
  first();
});

test("failed subscriptions/derivations release inputs and failed delivery does not poison global queue", () => {
  let starts = 0,
    stops = 0;
  const source = readable(1, () => {
    starts++;
    return () => stops++;
  });
  expect(() =>
    derived(source, () => {
      throw new Error("derive");
    }).subscribe(() => {}),
  ).toThrow("derive");
  expect([starts, stops]).toEqual([1, 1]);
  const value = writable(0);
  const seen: number[] = [];
  const bad = value.subscribe((n) => {
    if (n === 1) throw new Error("subscriber");
  });
  const good = value.subscribe((n) => seen.push(n));
  expect(() => value.set(1)).toThrow("subscriber");
  value.set(2);
  expect(seen).toEqual([0, 1, 2]);
  bad();
  good();
  const failing = readable(0, () => {
    throw new Error("start");
  });
  expect(() => get(failing)).toThrow("start");
  expect(() => get(failing)).toThrow("start");
});

test("invalidator failures preserve the first error and leave unrelated queued stores usable", () => {
  const state = writable(0),
    other = writable(0);
  const seen: number[] = [];
  const bad = state.subscribe(
    () => {},
    () => {
      throw new Error("invalidator");
    },
  );
  const good = state.subscribe((value) => seen.push(value));
  expect(() => state.set(1)).toThrow("invalidator");
  const values: number[] = [];
  const stop = other.subscribe((value) => values.push(value));
  other.set(1);
  expect(seen).toEqual([0, 1]);
  expect(values).toEqual([0, 1]);
  bad();
  good();
  stop();
});

test("get and derived normalize observable unsubscribe objects with receiver and one release", () => {
  let opens = 0,
    closes = 0;
  const observable = {
    subscribe(run: (value: number) => void) {
      opens++;
      run(4);
      return {
        closed: false,
        unsubscribe() {
          expect(this.closed).toBe(false);
          this.closed = true;
          opens--;
          closes++;
        },
      };
    },
  };
  const compatible =
    observable as unknown as import("../src/store").Readable<number>;
  expect(get(compatible)).toBe(4);
  expect([opens, closes]).toEqual([0, 1]);
  const values: number[] = [];
  const stop = derived(compatible, (value) => value * 2).subscribe((value) =>
    values.push(value),
  );
  expect(values).toEqual([8]);
  expect(opens).toBe(1);
  stop();
  stop();
  expect([opens, closes]).toEqual([0, 2]);
  expect(() =>
    derived(
      [
        compatible,
        {
          subscribe() {
            throw new Error("second input");
          },
        },
      ] as const,
      () => 0,
    ).subscribe(() => {}),
  ).toThrow("second input");
  expect([opens, closes]).toEqual([0, 3]);
  let callableClosed = 0;
  const callable = {
    subscribe(run: (value: number) => void) {
      run(5);
      return () => callableClosed++;
    },
  };
  expect(get(callable)).toBe(5);
  const release = derived(callable, (value) => value).subscribe(() => {});
  release();
  release();
  expect(callableClosed).toBe(2);
});

test("store protocol matches installed Svelte shared helpers", async () => {
  const reference = (await import(
    Bun.resolveSync(
      "svelte/store",
      `${import.meta.dir}/../../../examples/svelte-adopt`,
    )
  )) as {
    writable: typeof writable;
    readable: typeof readable;
    derived: typeof derived;
    get: typeof get;
  };
  function exercise(api: typeof reference) {
    const events: string[] = [];
    let starts = 0,
      stops = 0;
    const source = api.readable(1, (set, update) => {
      starts++;
      set(2);
      update((n) => n + 1);
      return () => {
        stops++;
      };
    });
    const a = source.subscribe((n) => events.push(`first:${n}`));
    const b = source.subscribe((n) => events.push(`second:${n}`));
    a();
    b();
    events.push(`get:${api.get(source)}`, `cohorts:${starts}/${stops}`);

    const left = api.writable(0),
      right = api.writable(0);
    const releases = [
      left.subscribe(
        (n) => {
          events.push(`a:${n}`);
          if (n === 1) right.set(1);
        },
        () => events.push("invalidate-a"),
      ),
      left.subscribe(
        (n) => events.push(`b:${n}`),
        () => events.push("invalidate-b"),
      ),
      right.subscribe(
        (n) => events.push(`c:${n}`),
        () => events.push("invalidate-c"),
      ),
    ];
    left.set(1);
    releases.forEach((stop) => stop());

    const object = { count: 1 },
      fn = () => 1;
    const equality = api.writable<unknown>(NaN);
    const equalValues: string[] = [];
    const stopEqual = equality.subscribe((value) =>
      equalValues.push(
        typeof value === "function"
          ? "function"
          : typeof value === "object"
            ? "object"
            : String(value),
      ),
    );
    for (const value of [NaN, 0, -0, object, object, fn, fn])
      equality.set(value);
    stopEqual();

    const input = api.writable(1);
    const doubled = api.derived(input, (n) => n * 2);
    const tripled = api.derived(input, (n) => n * 3);
    const totals: number[] = [];
    const stopTotals = api
      .derived([doubled, tripled] as const, ([x, y]) => x + y)
      .subscribe((n) => totals.push(n));
    const manual = api.derived(
      input,
      (value, set, update) => {
        events.push(`derive:${value}`);
        set(value);
        update((n) => n + 1);
        return () => {
          events.push(`cleanup:${value}`);
        };
      },
      0,
    );
    const manualValues: number[] = [];
    const stopManual = manual.subscribe((n) => manualValues.push(n));
    input.set(2);
    stopManual();
    stopTotals();
    input.set(3);

    let observableOpens = 0,
      observableCloses = 0;
    const observable = {
      subscribe(run: (value: number) => void) {
        observableOpens++;
        run(4);
        return {
          closed: false,
          unsubscribe() {
            if (this.closed) throw new Error("duplicate release");
            this.closed = true;
            observableCloses++;
          },
        };
      },
    } as unknown as import("../src/store").Readable<number>;
    const observed = [api.get(observable)];
    const stopObserved = api
      .derived(observable, (n) => n * 2)
      .subscribe((n) => observed.push(n));
    stopObserved();
    // Return snapshots, never mutable callback buffers or store/function identities.
    return JSON.stringify({
      events: [...events],
      equalValues: [...equalValues],
      totals: [...totals],
      manualValues: [...manualValues],
      observed: [...observed],
      observableOpens,
      observableCloses,
    });
  }
  const expected = exercise(reference);
  expect(exercise({ writable, readable, derived, get })).toBe(expected);
});
