import { expect, test } from "bun:test";
import { createRoot } from "../src/reactive";
import { createRotatingText } from "../src/rotating-text";

function withClock(
  run: (clock: {
    media: EventTarget & { matches: boolean };
    timers: Map<number, { tick(): void; delay: number }>;
  }) => void,
) {
  const keys = ["matchMedia", "setInterval", "clearInterval"] as const;
  const previous = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const media = Object.assign(new EventTarget(), { matches: false });
  const timers = new Map<number, { tick(): void; delay: number }>();
  let nextID = 0;
  Object.defineProperties(globalThis, {
    matchMedia: { configurable: true, value: () => media },
    setInterval: {
      configurable: true,
      value(callback: unknown, delay: number) {
        if (typeof callback !== "function")
          throw new Error("Expected a callback");
        const id = ++nextID;
        timers.set(id, { tick: () => callback(), delay });
        return id;
      },
    },
    clearInterval: {
      configurable: true,
      value(id: number) {
        timers.delete(id);
      },
    },
  });
  try {
    run({ media, timers });
  } finally {
    keys.forEach((key, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}

test("static phrases need neither an owner nor timers; rotating phrases require a live owner", () => {
  withClock(({ timers }) => {
    expect(createRotatingText([], 100)()).toBe("");
    expect(createRotatingText(["<first>&"], 100)()).toBe("<first>&");
    expect(() => createRotatingText(["one", "two"], 100)).toThrow(
      "live native owner",
    );
    expect(timers.size).toBe(0);
  });
});

test("rotation wraps, reduced motion resets, and disposed media/timer callbacks cannot restart work", () => {
  withClock(({ media, timers }) => {
    let stop!: () => void;
    const text = createRoot((dispose) => {
      stop = dispose;
      return createRotatingText(["first", "second"], 30);
    });
    const first = [...timers.values()][0]!;
    expect(first.delay).toBe(30);
    expect(text()).toBe("first");
    first.tick();
    expect(text()).toBe("second");
    first.tick();
    expect(text()).toBe("first");
    first.tick();
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(text()).toBe("first");
    expect(timers.size).toBe(0);
    media.matches = false;
    media.dispatchEvent(new Event("change"));
    media.dispatchEvent(new Event("change"));
    expect(timers.size).toBe(1);
    const resumed = [...timers.values()][0]!;
    stop();
    resumed.tick();
    media.dispatchEvent(new Event("change"));
    expect(text()).toBe("first");
    expect(timers.size).toBe(0);
  });
});

test("initial reduced motion allocates no timer and delays stay inside browser bounds", () => {
  withClock(({ media, timers }) => {
    media.matches = true;
    createRoot((stop) => {
      createRotatingText(["one", "two"], 0);
      expect(timers.size).toBe(0);
      media.matches = false;
      media.dispatchEvent(new Event("change"));
      expect([...timers.values()][0]!.delay).toBe(1);
      stop();
    });
    for (const [input, expected] of [
      [NaN, 1],
      [-1, 1],
      [Infinity, 2147483647],
    ]) {
      createRoot((stop) => {
        createRotatingText(["one", "two"], input!);
        expect([...timers.values()][0]!.delay).toBe(expected!);
        stop();
      });
    }
    expect(timers.size).toBe(0);
  });
});

test("failed media listener setup still cleans its owner", () => {
  withClock(({ media, timers }) => {
    media.addEventListener = () => {
      throw new Error("media failure");
    };
    expect(() =>
      createRoot(() => createRotatingText(["one", "two"], 10)),
    ).toThrow("media failure");
    expect(timers.size).toBe(0);
  });
});
