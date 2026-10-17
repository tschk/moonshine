import { expect, test } from "bun:test";
import {
  createComponent,
  getComponentContext,
  getContext,
  setContext,
  hasContext,
  getAllContexts,
  onComponentReady,
  withComponentConsumer,
} from "../src/component";
import {
  createComputed,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  onAfterDispose,
  runWithOwner,
  queuePostCommit,
  type Owner,
} from "../src/reactive";
import { Show } from "../src/control";

test("context copies are lazy, cached and isolated for each invocation", () => {
  for (const mode of ["dom", "ssr"] as const) {
    const contexts = new Map<unknown, unknown>([["key", "initial"]]);
    const iterate = contexts[Symbol.iterator].bind(contexts);
    let copies = 0;
    contexts[Symbol.iterator] = () => {
      copies++;
      return iterate();
    };
    createRoot((stop) => {
      createComponent(() => null, {}, mode, { contexts });
      expect(copies).toBe(0);
      createComponent(
        () => {
          contexts.set("key", "before read");
          expect(getContext("key")).toBe("before read");
          expect(copies).toBe(1);
          contexts.set("key", "after read");
          expect(getContext("key")).toBe("before read");
          setContext("private", 1);
          expect(hasContext("private")).toBe(true);
          expect(copies).toBe(1);
        },
        {},
        mode,
        { contexts },
      );
      expect(contexts.has("private")).toBe(false);
      createComponent(
        () => expect(getContext("key")).toBe("after read"),
        {},
        mode,
        { contexts },
      );
      expect(copies).toBe(2);
      stop();
    });
  }
});

test("reading child context does not initialize untouched ancestor maps", () => {
  for (const mode of ["dom", "ssr"] as const) {
    const supplied = new Map<unknown, unknown>([["key", "initial"]]);
    createRoot((stop) => {
      createComponent(
        () => {
          createComponent(
            () => {
              createComponent(
                () => expect(getContext("key")).toBe("initial"),
                {},
                mode,
              );
              supplied.set("key", "changed");
              expect(getContext("key")).toBe("changed");
              supplied.set("key", "later");
              createComponent(
                () => expect(getContext("key")).toBe("changed"),
                {},
                mode,
              );
            },
            {},
            mode,
          );
          expect(getContext("key")).toBe("later");
        },
        {},
        mode,
        { contexts: supplied },
      );
      stop();
    });
  }
});

test("component instances preserve live props descriptors and isolate contexts", () => {
  let value = 1;
  const props = {
    get value() {
      return value;
    },
  };
  createRoot((stop) => {
    const first = createComponent(
      (input) => {
        setContext("id", 1);
        expect(getComponentContext().props).toBe(props);
        return () => input.value;
      },
      props,
      "dom",
    );
    createComponent(
      () => {
        expect(hasContext("id")).toBe(false);
        setContext("id", 2);
      },
      {},
      "dom",
    );
    value = 2;
    expect(first()).toBe(2);
    stop();
  });
});

test("setup is untracked while nested computations retain ownership", () => {
  const [value, setValue] = createSignal(0);
  let setups = 0,
    effects = 0,
    cleanups = 0;
  createRoot((stop) => {
    createComputed(() => {
      createComponent(
        () => {
          setups++;
          value();
          onCleanup(() => cleanups++);
          createComputed(() => {
            value();
            effects++;
          });
        },
        {},
        "dom",
      );
    });
    setValue(1);
    expect(setups).toBe(1);
    expect(effects).toBe(2);
    stop();
    expect(cleanups).toBe(1);
  });
});

test("failed setup disposes all owned work and preserves original failure", () => {
  const [value, setValue] = createSignal(0);
  let effects = 0,
    cleanups = 0;
  const failure = new Error("setup");
  createRoot((stop) => {
    expect(() =>
      createComponent(
        () => {
          onCleanup(() => {
            cleanups++;
            throw new Error("cleanup");
          });
          onCleanup(() => cleanups++);
          createComputed(() => {
            value();
            effects++;
          });
          throw failure;
        },
        {},
        "dom",
      ),
    ).toThrow(failure);
    setValue(1);
    expect(effects).toBe(1);
    expect(cleanups).toBe(2);
    stop();
    expect(cleanups).toBe(2);
  });
});

test("context inheritance crosses detached roots and lazy Show owners", () => {
  const [visible, setVisible] = createSignal(false);
  let stopDetached!: () => void, branch!: () => unknown;
  const seen: unknown[] = [];
  createRoot((stop) => {
    createComponent(
      () => {
        setContext("shared", "parent");
        createRoot((dispose) => {
          stopDetached = dispose;
          expect(getOwner()!.parent).toBe(null);
          branch = Show({
            when: visible,
            children: () =>
              createComponent(
                () => {
                  seen.push(getContext<string>("shared"));
                  setContext("shared", "child");
                  return "branch";
                },
                {},
                "dom",
              ),
          });
        });
        expect(getContext<string>("shared")).toBe("parent");
      },
      {},
      "dom",
    );
    setVisible(true);
    expect(branch()).toBe("branch");
    setVisible(false);
    setVisible(true);
    expect(branch()).toBe("branch");
    expect(seen).toEqual(["parent", "parent"]);
    stop();
    stopDetached();
  });
});

test("mode is per instance and context APIs reject after setup", () => {
  let captured!: ReturnType<typeof getComponentContext>;
  createRoot((stop) => {
    createComponent(
      () => {
        captured = getComponentContext();
        expect(captured.mode).toBe("ssr");
        setContext("key", 1);
        const snapshot = getAllContexts();
        snapshot.set("key", 2);
        expect(getContext<number>("key")).toBe(1);
        createComponent(
          () => expect(getComponentContext().mode).toBe("dom"),
          {},
          "dom",
        );
      },
      {},
      "ssr",
    );
    expect(captured.active).toBe(false);
    expect(() => setContext("key", 3)).toThrow("initialization");
    stop();
  });
  expect(() => getComponentContext()).toThrow("initialization");
});

test("disposal releases the owner carrier after cleanup and stop even when both throw", () => {
  let owner!: Owner, stop!: () => void;
  const cleanupError = new Error("cleanup"),
    stopError = new Error("stop");
  createRoot((dispose) => {
    stop = dispose;
    createComponent(
      () => {
        owner = getOwner()!;
        onCleanup(() => {
          expect(owner.context).toBeDefined();
          throw cleanupError;
        });
        owner.stop = () => {
          expect(owner.context).toBeDefined();
          throw stopError;
        };
      },
      { request: "retained until disposal" },
      "ssr",
    );
  });
  expect(() => stop()).toThrow(cleanupError);
  expect(owner.disposed).toBe(true);
  expect(owner.context).toBe(undefined);
  stop();
});

test("failed component setup clears its captured carrier while preserving setup error", () => {
  let owner!: Owner;
  const error = new Error("setup"),
    cleanup = new Error("cleanup");
  expect(() =>
    createComponent(
      () => {
        owner = getOwner()!;
        onCleanup(() => {
          throw cleanup;
        });
        throw error;
      },
      {},
      "ssr",
    ),
  ).toThrow(error);
  expect(owner.context).toBe(undefined);
  expect(owner.disposed).toBe(true);
});

test("detached roots retain inherited carrier after parent disposal", () => {
  let parent!: Owner,
    detached!: Owner,
    stopParent!: () => void,
    stopDetached!: () => void;
  let cleanups = 0;
  createRoot((dispose) => {
    stopParent = dispose;
    createComponent(
      () => {
        parent = getOwner()!;
        setContext("request", "parent context");
        createRoot((stop) => {
          stopDetached = stop;
          detached = getOwner()!;
        });
      },
      {},
      "ssr",
    );
  });
  const carrier = detached.context;
  expect(carrier).toBe(parent.context);
  stopParent();
  expect(parent.context).toBe(undefined);
  expect(detached.disposed).toBe(false);
  expect(detached.context).toBe(carrier);
  runWithOwner(detached, () =>
    createComponent(
      () => {
        expect(getContext<string>("request")).toBe("parent context");
        onCleanup(() => cleanups++);
      },
      {},
      "ssr",
    ),
  );
  stopDetached();
  stopDetached();
  expect(cleanups).toBe(1);
  expect(detached.context).toBe(undefined);
});

test("component ready callbacks run once after successful inactive setup with child-first completion", () => {
  const trace: string[] = [];
  let parentFrame!: ReturnType<typeof getComponentContext>;
  createRoot((stop) => {
    createComponent(
      () => {
        parentFrame = getComponentContext();
        onComponentReady(() => {
          expect(parentFrame.active).toBe(false);
          trace.push("parent-ready");
        });
        trace.push("parent-setup");
        createComponent(
          () => {
            const frame = getComponentContext();
            onComponentReady(() => {
              expect(frame.active).toBe(false);
              trace.push("child-ready");
            });
            trace.push("child-setup");
          },
          {},
          "dom",
        );
        trace.push("parent-return");
      },
      {},
      "dom",
    );
    stop();
  });
  expect(trace).toEqual([
    "parent-setup",
    "child-setup",
    "child-ready",
    "parent-return",
    "parent-ready",
  ]);
  expect(() => onComponentReady(() => {})).toThrow("initialization");
});

test("failed or cancelled setup never fires ready; ready errors clean owned work", () => {
  let ready = 0,
    cleanups = 0;
  const first = new Error("ready failure");
  expect(() =>
    createRoot(() =>
      createComponent(
        () => {
          onComponentReady(() => ready++);
          throw new Error("setup failed");
        },
        {},
        "dom",
      ),
    ),
  ).toThrow("setup failed");
  createRoot((stop) => {
    createComponent(
      () => {
        onComponentReady(() => ready++);
        stop();
      },
      {},
      "dom",
    );
  });
  expect(ready).toBe(0);
  expect(() =>
    createRoot(() =>
      createComponent(
        () => {
          onCleanup(() => cleanups++);
          onComponentReady(() => {
            ready++;
            throw first;
          });
          onComponentReady(() => ready++);
        },
        {},
        "dom",
      ),
    ),
  ).toThrow(first);
  expect([ready, cleanups]).toEqual([2, 1]);
});

test("ready callbacks can queue owned post-commit work outside roots and cancel before flush", async () => {
  let mounts = 0;
  let stop!: () => void;
  const componentOwner = createRoot((dispose) => {
    stop = dispose;
    return getOwner()!;
  });
  runWithOwner(componentOwner, () =>
    createComponent(
      () => {
        const frame = getComponentContext();
        onComponentReady(() =>
          queuePostCommit(() => {
            if (!frame.owner.disposed) mounts++;
          }),
        );
      },
      {},
      "dom",
    ),
  );
  expect(mounts).toBe(0);
  stop();
  await Promise.resolve();
  expect(mounts).toBe(0);
});

test("disposed owners reject component setup and ready callbacks", () => {
  let setups = 0,
    ready = 0;
  const stop = createRoot((dispose) => {
    onAfterDispose(() => {
      expect(() =>
        createComponent(
          () => {
            setups++;
            onComponentReady(() => ready++);
          },
          {},
          "dom",
        ),
      ).toThrow("disposed native owner");
    });
    return dispose;
  });
  stop();
  expect([setups, ready]).toEqual([0, 0]);
});

test("consumer callbacks do not restore a disposed owner's context on return or throw", () => {
  for (const mode of ["dom", "ssr"] as const)
    for (const fails of [false, true]) {
      let frame!: ReturnType<typeof getComponentContext>, stop!: () => void;
      const failure = new Error("consumer callback");
      createRoot((dispose) => {
        stop = dispose;
        createComponent(
          () => {
            frame = getComponentContext();
          },
          { request: "private context" },
          mode,
        );
      });
      const invoke = () =>
        runWithOwner(frame.owner, () =>
          withComponentConsumer(frame, () => {
            stop();
            if (fails) throw failure;
          }),
        );
      if (fails) expect(invoke).toThrow(failure);
      else invoke();
      expect(frame.owner.disposed).toBe(true);
      expect(frame.owner.context).toBeUndefined();
      expect(frame.active).toBe(false);
    }
});
