import { expect, test } from "bun:test";
import {
  createRoot,
  catchError,
  getOwner,
  runWithOwner,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import {
  createComponent,
  getComponentContext,
} from "@tschk/moonshine-dom/component";
import { ref, watch, watchSyncEffect } from "@tschk/moonshine-vue/reactive";
import { withComponentErrorHandler } from "@tschk/moonshine-vue/errors";
test("callback receives original thrown value, native component frame and finite phase synchronously", () => {
  const failure = { raw: true },
    value = ref(0),
    trace: unknown[] = [];
  let frame: ReturnType<typeof getComponentContext>;
  createRoot((stop) => {
    withComponentErrorHandler(
      (error, info) => {
        expect(error).toBe(failure);
        expect(info.component).toBe(frame);
        expect(info.phase).toBe("watch callback");
        trace.push("handler");
      },
      () =>
        createComponent(
          () => {
            frame = getComponentContext();
            watch(
              value,
              () => {
                trace.push("callback");
                throw failure;
              },
              { flush: "sync" },
            );
          },
          {},
          "dom",
        ),
    );
    trace.push("before");
    value.value = 1;
    trace.push("after");
    expect(trace).toEqual(["before", "callback", "handler", "after"]);
    stop();
  });
});
test("handler reads stay untracked and watcher source dependencies remain active", () => {
  const a = ref(0),
    other = ref(0);
  let calls = 0,
    handled = 0;
  createRoot((stop) => {
    withComponentErrorHandler(
      () => {
        void other.value;
        handled++;
      },
      () =>
        watch(
          () => a.value,
          () => {
            calls++;
            throw "bad";
          },
          { flush: "sync" },
        ),
    );
    a.value = 1;
    other.value = 1;
    expect([calls, handled]).toEqual([1, 1]);
    a.value = 2;
    expect([calls, handled]).toEqual([2, 2]);
    stop();
  });
});
test("genuine reentrant errors reenter handler without suppressing feedback", () => {
  const value = ref(0),
    trace: string[] = [];
  createRoot((stop) => {
    withComponentErrorHandler(
      (error) => {
        trace.push("handler:" + error);
        if (value.value < 3) value.value++;
      },
      () =>
        watch(
          value,
          (n) => {
            trace.push("watch:" + n);
            if (n < 3) throw n;
          },
          { flush: "sync" },
        ),
    );
    value.value = 1;
    expect(trace).toEqual([
      "watch:1",
      "handler:1",
      "watch:2",
      "handler:2",
      "watch:3",
    ]);
    stop();
  });
});
test("handler throw logs secondary once, consumes original and never reaches native parent boundary", () => {
  const value = ref(0),
    secondary = { secondary: true },
    logged: unknown[] = [],
    outer: unknown[] = [];
  const original = console.error;
  console.error = (...args) => logged.push(...args);
  try {
    createRoot((stop) => {
      catchError(
        () =>
          withComponentErrorHandler(
            () => {
              throw secondary;
            },
            () =>
              watch(
                value,
                () => {
                  throw "original";
                },
                { flush: "sync" },
              ),
          ),
        (e) => outer.push(e),
      );
      value.value = 1;
      expect(logged).toEqual([secondary]);
      expect(outer).toEqual([]);
      stop();
    });
  } finally {
    console.error = original;
  }
});
test("no policy retains raw throwing behavior and native catchError coexistence", () => {
  const value = ref(0),
    failure = { unknown: true },
    seen: unknown[] = [];
  const stop = watch(
    value,
    () => {
      throw failure;
    },
    { flush: "sync" },
  );
  let caught: unknown;
  try {
    value.value = 1;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(failure);
  stop();
  let dispose!: () => void;
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    catchError(
      () =>
        watch(
          value,
          () => {
            throw failure;
          },
          { flush: "sync" },
        ),
      (error) => seen.push(error.cause),
    );
    value.value = 2;
  });
  expect(seen).toEqual([failure]);
  dispose();
});
test("handler disposal stops owned watcher cleanup once and later writes are inert", () => {
  const value = ref(0);
  let stop!: () => void,
    calls = 0,
    clean = 0;
  createRoot((dispose) => {
    stop = dispose;
    withComponentErrorHandler(
      () => stop(),
      () =>
        watch(
          value,
          (_, __, cleanup) => {
            calls++;
            cleanup(() => clean++);
            throw "bad";
          },
          { flush: "sync" },
        ),
    );
  });
  value.value = 1;
  expect([calls, clean]).toEqual([1, 1]);
  value.value = 2;
  stop();
  expect([calls, clean]).toEqual([1, 1]);
});
test("nested policy scope stays isolated from its sibling and creates no component frame", () => {
  const a = ref(0),
    b = ref(0),
    trace: string[] = [];
  createRoot((stop) => {
    withComponentErrorHandler(
      () => trace.push("outer"),
      () => {
        withComponentErrorHandler(
          () => trace.push("inner"),
          () =>
            watch(
              a,
              () => {
                throw 1;
              },
              { flush: "sync" },
            ),
        );
        watch(
          b,
          () => {
            throw 2;
          },
          { flush: "sync" },
        );
      },
    );
    a.value = 1;
    b.value = 1;
    expect(trace).toEqual(["inner", "outer"]);
    stop();
  });
});
test("configured cleanup peers continue and tracked effect retains dependencies", () => {
  const value = ref(0),
    other = ref(0),
    phases: string[] = [],
    runs: number[] = [],
    cleaned: number[] = [];
  createRoot((stop) => {
    withComponentErrorHandler(
      (_, info) => {
        void other.value;
        phases.push(info.phase);
      },
      () => {
        watch(
          value,
          (n, _, cleanup) => {
            cleanup(() => {
              cleaned.push(n);
              throw "cleanup";
            });
            cleanup(() => cleaned.push(n + 10));
          },
          { flush: "sync", immediate: true },
        );
        watchSyncEffect(() => {
          runs.push(value.value);
          if (value.value) throw "effect";
        });
      },
    );
    value.value = 1;
    other.value = 1;
    value.value = 2;
    expect(runs).toEqual([0, 1, 2]);
    expect(cleaned).toEqual([0, 10, 1, 11]);
    expect(phases).toEqual([
      "watch cleanup",
      "watch effect",
      "watch cleanup",
      "watch effect",
    ]);
    stop();
    expect(cleaned).toEqual([0, 10, 1, 11, 2, 12]);
    expect(phases.at(-1)).toBe("watch cleanup");
  });
});
test("handled function getter returns undefined while native no-policy errors remain", () => {
  const value = ref(0),
    phases: string[] = [],
    calls: unknown[] = [];
  createRoot((stop) => {
    withComponentErrorHandler(
      (_, info) => phases.push(info.phase),
      () =>
        watch(
          () => {
            if (value.value === 1) throw "getter";
            return value.value;
          },
          (n) => calls.push(n),
          { flush: "sync" },
        ),
    );
    value.value = 1;
    value.value = 2;
    expect(calls).toEqual([undefined, 2]);
    expect(phases).toEqual(["watch getter"]);
    stop();
  });
  createRoot((stop) => {
    watch(
      value,
      (_, __, cleanup) =>
        cleanup(() => {
          throw "cleanup";
        }),
      { flush: "sync", immediate: true },
    );
    expect(() => {
      value.value = 3;
    }).toThrow();
    stop();
  });
  expect(() =>
    createRoot((stop) => {
      try {
        watchSyncEffect(() => {
          throw "effect";
        });
      } finally {
        stop();
      }
    }),
  ).toThrow();
});
test("policy rejects absent/disposed owner and rolls back failed setup", () => {
  expect(() =>
    withComponentErrorHandler(
      () => {},
      () => {},
    ),
  ).toThrow("live owner");
  let owner: ReturnType<typeof getOwner>,
    clean = 0;
  createRoot((stop) => {
    owner = getOwner();
    expect(() =>
      withComponentErrorHandler(
        () => {},
        () => {
          onCleanup(() => clean++);
          throw "setup";
        },
      ),
    ).toThrow();
    expect(clean).toBe(1);
    stop();
  });
  expect(() =>
    runWithOwner(owner!, () =>
      withComponentErrorHandler(
        () => {},
        () => {},
      ),
    ),
  ).toThrow("live owner");
});

test("deferred callback rejection retains captured handler/frame after disposal without owner reentry", async () => {
  const value = ref(0),
    failure = { late: true },
    seen: unknown[] = [];
  let reject!: (error: unknown) => void,
    frame!: ReturnType<typeof getComponentContext>,
    stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    withComponentErrorHandler(
      (error, info) => {
        seen.push([
          error,
          info.component === frame,
          info.component?.owner.disposed,
          info.phase,
          getOwner(),
        ]);
      },
      () =>
        createComponent(
          () => {
            frame = getComponentContext();
            watch(
              value,
              () =>
                new Promise<void>((_resolve, fail) => {
                  reject = fail;
                }),
              { flush: "sync" },
            );
          },
          {},
          "dom",
        ),
    );
  });
  value.value = 1;
  stop();
  reject(failure);
  await Promise.resolve();
  expect(seen).toEqual([[failure, true, true, "watch callback", null]]);
});
test("then-only is ignored, then+catch preserves receiver and getter count, catch throw escapes", () => {
  const value = ref(0),
    trace: unknown[] = [];
  let mode = "then";
  const candidate = {
    // oxlint-disable-next-line unicorn/no-thenable -- verify the observed user-returned thenable protocol.
    get then() {
      trace.push("then-get");
      return () => trace.push("then-call");
    },
    get catch() {
      trace.push("catch-get");
      return function (this: unknown, fail: (error: unknown) => void) {
        trace.push(["catch-call", this === candidate]);
        if (mode === "throw") throw "method";
        fail("rejected");
      };
    },
  };
  createRoot((stop) => {
    withComponentErrorHandler(
      (error, info) => trace.push([error, info.phase]),
      () =>
        watch(
          value,
          () =>
            mode === "only"
              ? {
                  // oxlint-disable-next-line unicorn/no-thenable -- then-only values must remain ignored.
                  then: () => trace.push("only-called"),
                }
              : candidate,
          { flush: "sync" },
        ),
    );
    value.value = 1;
    expect(trace).toEqual([
      "then-get",
      "catch-get",
      "catch-get",
      ["catch-call", true],
      ["rejected", "watch callback"],
    ]);
    trace.length = 0;
    mode = "only";
    value.value = 2;
    expect(trace).toEqual([]);
    mode = "throw";
    expect(() => {
      value.value = 3;
    }).toThrow();
    expect(trace).toEqual([
      "then-get",
      "catch-get",
      "catch-get",
      ["catch-call", true],
    ]);
    stop();
  });
});
test("cleanup returned rejection after stop reports cleanup with captured policy", async () => {
  const value = ref(0),
    trace: unknown[] = [];
  let reject!: (error: unknown) => void;
  createRoot((stop) => {
    withComponentErrorHandler(
      (error, info) => trace.push([error, info.phase]),
      () =>
        watch(
          value,
          (_, __, cleanup) =>
            cleanup(
              () =>
                new Promise<void>((_resolve, fail) => {
                  reject = fail;
                }),
            ),
          { flush: "sync", immediate: true },
        ),
    );
    stop();
  });
  reject("cleanup rejection");
  await Promise.resolve();
  expect(trace).toEqual([["cleanup rejection", "watch cleanup"]]);
});
test("function getter observes async returns without replacing its returned value", async () => {
  const source = ref(0),
    trace: unknown[] = [];
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((_, fail) => {
    reject = fail;
  });
  const candidate = {
    // oxlint-disable-next-line unicorn/no-thenable -- match pinned Vue getter return inspection.
    get then() {
      trace.push("then-get");
      return () => {};
    },
    get catch() {
      trace.push("catch-get");
      return function (this: unknown, fail: (error: unknown) => void) {
        trace.push(["catch-call", this === candidate]);
        fail("getter rejection");
      };
    },
  };
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    withComponentErrorHandler(
      (error, info) => trace.push([error, info.phase]),
      () =>
        watch(
          () =>
            source.value === 0
              ? null
              : source.value === 1
                ? candidate
                : promise,
          (value) =>
            trace.push(["identity", value === candidate, value === promise]),
          { flush: "sync" },
        ),
    );
  });
  source.value = 1;
  expect(trace).toEqual([
    "then-get",
    "catch-get",
    "catch-get",
    ["catch-call", true],
    ["getter rejection", "watch getter"],
    ["identity", true, false],
  ]);
  trace.length = 0;
  source.value = 2;
  stop();
  reject("promise rejection");
  await Promise.resolve();
  expect(trace).toEqual([
    ["identity", false, true],
    ["promise rejection", "watch getter"],
  ]);
});
