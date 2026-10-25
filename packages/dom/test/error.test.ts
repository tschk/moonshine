import { test, expect } from "bun:test";
import {
  createRoot,
  createSignal,
  createEffect,
  createMemo,
  createComponentScope,
  onCleanup,
  catchError,
  getOwner,
  runWithOwner,
  queuePostCommit,
} from "../src/reactive";
import { ErrorBoundary } from "../src/control";
test("sticky boundary cleans failed child before fallback and resets", () => {
  const logs: string[] = [];
  let stop!: () => void, reset!: () => void;
  const [bad, setBad] = createSignal(false);
  let view!: () => string | undefined;
  createRoot((d) => {
    stop = d;
    view = ErrorBoundary({
      children: () => {
        logs.push("setup");
        onCleanup(() => logs.push("child-clean"));
        createEffect(() => {
          if (bad()) throw "bad";
        });
        return "child";
      },
      fallback: (e, r) => {
        logs.push("fallback:" + e.message);
        reset = r;
        onCleanup(() => logs.push("fallback-clean"));
        return "error";
      },
    });
  });
  expect(view()).toBe("child");
  setBad(true);
  expect(view()).toBe("error");
  expect(logs).toEqual(["setup", "child-clean", "fallback:bad"]);
  setBad(false);
  expect(view()).toBe("error");
  reset();
  expect(view()).toBe("child");
  stop();
  expect(logs).toEqual([
    "setup",
    "child-clean",
    "fallback:bad",
    "fallback-clean",
    "setup",
    "child-clean",
  ]);
});
test("catch retains tracking, normalized handlers route outward, peers drain", () => {
  const [n, set] = createSignal(0);
  const values: number[] = [];
  const errors: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        createMemo(() =>
          catchError(
            () => {
              values.push(n());
              if (n()) throw { bad: true };
              return 1;
            },
            (e) => {
              expect(e.cause).toEqual({ bad: true });
              throw "outer";
            },
          ),
        );
      },
      (e) => errors.push(e.message),
    );
    createEffect(() => values.push(n() + 10));
  });
  set(1);
  expect(errors).toEqual(["outer"]);
  expect(values).toEqual([0, 10, 1, 11]);
  stop();
  set(2);
  expect(values).toEqual([0, 10, 1, 11]);
});
test("component setup failure cleans before boundary; cleanup failures escape", () => {
  const log: string[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    catchError(
      () =>
        createComponentScope(() => {
          onCleanup(() => log.push("clean"));
          throw 4;
        }),
      (e) => log.push(e.message),
    );
  });
  expect(log).toEqual(["clean", "Unknown error"]);
  stop();
  const [n, set] = createSignal(0);
  let caught = 0;
  createRoot((d) => {
    stop = d;
    catchError(
      () =>
        createEffect(() => {
          n();
          onCleanup(() => {
            throw Error("cleanup");
          });
        }),
      () => caught++,
    );
  });
  expect(() => set(1)).toThrow("cleanup");
  expect(caught).toBe(0);
  expect(() => stop()).not.toThrow();
});
test("nested fallback failure reaches outer boundary with cleanup first", () => {
  const log: string[] = [];
  let view!: () => string | undefined;
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    view = ErrorBoundary({
      children: () =>
        ErrorBoundary({
          children: () => {
            onCleanup(() => log.push("inner-clean"));
            throw Error("child");
          },
          fallback: () => {
            onCleanup(() => log.push("fallback-clean"));
            throw Error("fallback");
          },
        }) as unknown as string,
      fallback: (e) => {
        log.push(e.message);
        return "outer";
      },
    });
  });
  expect(view()).toBe("outer");
  expect(log).toEqual(["inner-clean", "fallback-clean", "fallback"]);
  stop();
});
test("queued sibling failures do not resurrect disposed boundary branches", () => {
  let mounts = 0,
    fallbacks = 0;
  const [bad, set] = createSignal(false);
  let stop!: () => void;
  let view!: () => string | undefined;
  createRoot((d) => {
    stop = d;
    view = ErrorBoundary({
      children: () => {
        mounts++;
        createEffect(() => {
          if (bad()) throw Error("a");
        });
        createEffect(() => {
          if (bad()) throw Error("b");
        });
        return "ok";
      },
      fallback: () => {
        fallbacks++;
        return "bad";
      },
    });
  });
  set(true);
  expect(view()).toBe("bad");
  expect(fallbacks).toBe(1);
  stop();
  set(false);
  expect(mounts).toBe(1);
});
test("memo callbacks retry and unrelated event and promise errors stay outside", async () => {
  const [n, set] = createSignal(0);
  let memo!: () => number;
  let stop!: () => void;
  const errors: string[] = [];
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        memo = createMemo(() => {
          if (n() === 1) throw Error("memo");
          return n();
        });
      },
      (e) => errors.push(e.message),
    );
  });
  set(1);
  expect(memo()).toBe(0);
  set(2);
  expect(memo()).toBe(2);
  expect(errors).toEqual(["memo"]);
  let event!: () => never, stopEvent!: () => void;
  createRoot((d) => {
    stopEvent = d;
    catchError(
      () => {
        event = () => {
          throw Error("event");
        };
      },
      (e) => errors.push(e.message),
    );
  });
  expect(event).toThrow("event");
  stopEvent();
  await expect(Promise.reject(Error("promise"))).rejects.toThrow("promise");
  expect(errors).toEqual(["memo"]);
  stop();
});

test("nested startup cannot route inside outer kernel callback", () => {
  const [error, setError] = createSignal(false);
  let inside = false;
  let routedInside = false;
  let stop!: () => void;
  const scope = createRoot((d) => {
    stop = d;
    return getOwner();
  });
  const outer = runWithOwner(scope, () =>
    createMemo(() => {
      inside = true;
      error();
      catchError(
        () =>
          createMemo(() => {
            throw Error("inner");
          }),
        () => {
          routedInside = inside;
          setError(true);
        },
      );
      inside = false;
      return error();
    }),
  );
  expect(outer()).toBe(true);
  expect(routedInside).toBe(false);
  stop();
});
import {
  createMemo as coreMemo,
  createSignal as coreSignal,
} from "@tschk/moonshine";
test("foreign core collection defers handler until microtask", async () => {
  let inside = false,
    routedInside = false;
  const log: string[] = [];
  let stop!: () => void;
  const scope = createRoot((d) => {
    stop = d;
    return getOwner();
  });
  const outer = coreMemo(() =>
    runWithOwner(scope, () => {
      inside = true;
      catchError(
        () =>
          createMemo(() => {
            throw "nested";
          }),
        () => {
          routedInside = inside;
          log.push("handler");
        },
      );
      inside = false;
      return 4;
    }),
  );
  expect(outer()).toBe(4);
  expect(log).toEqual([]);
  await Promise.resolve();
  expect(log).toEqual(["handler"]);
  expect(routedInside).toBe(false);
  stop();
});
test("foreign core writes defer fallback; native batch commits synchronously", async () => {
  const n = coreSignal(false);
  let view!: () => string | undefined;
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    view = ErrorBoundary({
      children: () => {
        createEffect(() => {
          if (n()) throw "foreign";
        });
        return "child";
      },
      fallback: () => "fallback",
    });
  });
  n.set(true);
  expect(view()).toBe("child");
  await Promise.resolve();
  expect(view()).toBe("fallback");
  stop();
});

test("unrelated memo startup preserves outside post-commit microtask timing", async () => {
  const log: string[] = [];
  let stop!: () => void;
  const scope = createRoot((d) => {
    stop = d;
    return getOwner();
  });
  queuePostCommit(() => log.push("post"));
  runWithOwner(scope, () => createMemo(() => 1));
  expect(log).toEqual([]);
  await Promise.resolve();
  expect(log).toEqual(["post"]);
  stop();
});

test("normalizeError handles different error types", () => {
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    catchError(
      () => {
        throw "string error";
      },
      (e) => {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe("string error");
        expect(e.cause).toBe("string error");
      },
    );

    catchError(
      () => {
        throw { custom: "object" };
      },
      (e) => {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe("Unknown error");
        expect(e.cause).toEqual({ custom: "object" });
      },
    );

    const err = new Error("real error");
    catchError(
      () => {
        throw err;
      },
      (e) => {
        expect(e).toBe(err);
      },
    );
  });
  stop();
});
