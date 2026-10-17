import { test, expect } from "bun:test";
import {
  createComponent,
  getComponentContext,
  peekComponentContext,
  withComponentConsumer,
  withComponentCleanupConsumer,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import {
  createRoot,
  getOwner,
  runWithOwner,
  onCleanup,
  onBeforeDispose,
  onAfterDispose,
  createComputed,
  createMemo,
  createComponentScope,
  createErrorOwner,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
import {
  getContext,
  setContext,
  hasContext,
  getAllContexts,
  onMount,
  onDestroy,
} from "../src/svelte";
import { createRuneEffect } from "../src/effect";
import { withRuneScheduler } from "../src/pre";
import { createState } from "../src/state";
import { createConstDerived } from "../src/const-derived";
import { isHistoryReading } from "../src/history";

test("scoped cleanup context restores nested frames and errors without replacing current owner", () => {
  let a!: ComponentContext, b!: ComponentContext, owner!: Owner;
  const stop = createRoot((dispose) => {
    createComponent(
      () => {
        a = getComponentContext();
        setContext("key", "A");
        createComponent(
          () => {
            b = getComponentContext();
            setContext("key", "B");
          },
          {},
          "dom",
        );
        owner = getOwner()!;
      },
      {},
      "dom",
    );
    return dispose;
  });
  const previous = owner.context;
  const failure = { original: true };
  runWithOwner(owner, () => {
    expect(() => getContext<string>("key")).toThrow();
    expect(() =>
      withComponentCleanupConsumer(a, () => {
        expect(getOwner()).toBe(owner);
        expect(getContext<string>("key")).toBe("A");
        expect(hasContext("key")).toBe(true);
        expect(getAllContexts().get("key")).toBe("A");
        expect(setContext("key", "A2")).toBe("A2");
        expect(() =>
          withComponentCleanupConsumer(b, () => {
            expect(getOwner()).toBe(owner);
            expect(getContext<string>("key")).toBe("B");
            throw failure;
          }),
        ).toThrow();
        expect(peekComponentContext()).toBe(a);
        expect(getContext<string>("key")).toBe("A2");
        expect(b.active).toBe(false);
        throw failure;
      }),
    ).toThrow();
    expect(owner.context).toBe(previous);
    expect(a.active).toBe(false);
    expect(b.active).toBe(false);
    expect(() => getContext<string>("key")).toThrow();
  });
  stop();
});

test("cleanup capability allows disposed context but forbids every owned registration before setup", () => {
  let frame!: ComponentContext, owner!: Owner;
  let calls = 0;
  const stop = createRoot((dispose) => {
    createComponent(
      () => {
        frame = getComponentContext();
        owner = getOwner()!;
        setContext("key", "value");
      },
      {},
      "dom",
    );
    return dispose;
  });
  const operations = [
    () => createRoot(() => calls++),
    () => createComponentScope(() => calls++),
    () => createErrorOwner(),
    () => createComputed(() => calls++),
    () => createMemo(() => calls++),
    () => onCleanup(() => calls++),
    () => onBeforeDispose(() => calls++),
    () => onAfterDispose(() => calls++),
    () => onMount(() => calls++),
    () => onDestroy(() => calls++),
    () =>
      createRuneEffect(() => {
        calls++;
      }),
  ];
  // The capability also forbids work while the original owner is still live.
  runWithOwner(owner, () =>
    withComponentCleanupConsumer(frame, () => {
      for (const operation of operations)
        expect(operation).toThrow("effect_in_teardown");
    }),
  );
  expect(calls).toBe(0);
  stop();
  expect(owner.disposed).toBe(true);
  const previous = owner.context;
  runWithOwner(owner, () => {
    expect(() => getContext<string>("key")).toThrow();
    expect(() => withComponentConsumer(frame, () => {})).toThrow(
      "Live component consumer required",
    );
    withComponentCleanupConsumer(frame, () => {
      expect(getOwner()).toBe(owner);
      expect(owner.disposed).toBe(true);
      expect(getContext<string>("key")).toBe("value");
      expect(hasContext("key")).toBe(true);
      expect(getAllContexts().get("key")).toBe("value");
      setContext("key", "after");
      expect(getContext<string>("key")).toBe("after");
      for (const [i, operation] of operations.entries())
        expect(operation).toThrow(
          i === operations.length - 1
            ? "Rune effects require a live native owner"
            : "effect_in_teardown",
        );
    });
    expect(owner.context).toBe(previous);
    expect(frame.active).toBe(false);
    expect(() => getContext<string>("key")).toThrow();
    expect(() => onCleanup(() => calls++)).not.toThrow();
  });
  expect(calls).toBe(0);
  expect(owner.children.size).toBe(0);
});

for (const whole of [false, true])
  test(`historical const restores all context APIs with ${whole ? "disposed consumer" : "live consumer"} and keeps history`, () => {
    const trace: unknown[][] = [];
    let state!: ReturnType<typeof createState<number>>,
      value!: { readonly value: number },
      stopBranch!: () => void;
    const stop = createRoot((dispose) => {
      createComponent(
        () =>
          withRuneScheduler(() => {
            setContext("key", "initial");
            state = createState(1);
            const setup = () => {
              value = createConstDerived(() => {
                const n = state.value;
                trace.push([
                  "compute",
                  n,
                  getContext<string>("key"),
                  hasContext("key"),
                  getAllContexts().get("key"),
                  isHistoryReading(),
                ]);
                setContext("key", "written");
                return n;
              });
              onDestroy(() => trace.push(["read", value.value]));
            };
            if (whole) setup();
            else
              createRoot((disposeBranch) => {
                stopBranch = disposeBranch;
                setup();
              });
          }),
        {},
        "dom",
      );
      return dispose;
    });
    expect(value.value).toBe(1);
    state.value = 2;
    if (!whole) stopBranch();
    stop();
    expect(trace).toEqual([
      ["compute", 1, "initial", true, "initial", false],
      ["compute", 1, "written", true, "written", true],
      ["read", 1],
    ]);
  });

test("live owner disposal retains only the active outer cleanup capability", () => {
  let frame!: ComponentContext, owner!: Owner;
  const stop = createRoot((dispose) => {
    createComponent(
      () => {
        frame = getComponentContext();
        owner = getOwner()!;
      },
      {},
      "dom",
    );
    return dispose;
  });
  runWithOwner(owner, () =>
    withComponentCleanupConsumer(frame, () => {
      withComponentCleanupConsumer(frame, () => {
        stop();
        expect(owner.disposed).toBe(true);
      });
      expect(getComponentContext()).toBe(frame);
    }),
  );
  expect(owner.context).toBeUndefined();
  expect(frame.active).toBe(false);
});

for (const ordinaryInner of [false, true])
  for (const throws of [false, true])
    test(`nested ${ordinaryInner ? "ordinary" : "cleanup"} consumer disposal ${throws ? "throws" : "returns"} keeps outer guard until finally`, () => {
      let frame!: ComponentContext, owner!: Owner;
      let calls = 0;
      const failure = { original: true };
      const stop = createRoot((dispose) => {
        createComponent(
          () => {
            frame = getComponentContext();
            owner = getOwner()!;
            setContext("key", "before");
            onAfterDispose(() => {
              expect(() => createRoot(() => calls++)).toThrow(
                "effect_in_teardown",
              );
            });
          },
          {},
          "dom",
        );
        return dispose;
      });
      runWithOwner(owner, () => {
        withComponentCleanupConsumer(frame, () => {
          const inner = ordinaryInner
            ? withComponentConsumer
            : withComponentCleanupConsumer;
          try {
            inner(frame, () => {
              stop();
              if (throws) throw failure;
            });
          } catch (error) {
            expect(error).toBe(failure);
          }
          expect(owner.disposed).toBe(true);
          expect(getContext<string>("key")).toBe("before");
          expect(hasContext("key")).toBe(true);
          expect(getAllContexts().get("key")).toBe("before");
          setContext("key", "after");
          expect(getContext<string>("key")).toBe("after");
          const operations = [
            () => createRoot(() => calls++),
            () => createComponentScope(() => calls++),
            () => createErrorOwner(),
            () => createComputed(() => calls++),
            () => createMemo(() => calls++),
            () => onCleanup(() => calls++),
            () => onBeforeDispose(() => calls++),
            () => onAfterDispose(() => calls++),
            () => onMount(() => calls++),
            () => onDestroy(() => calls++),
          ];
          for (const operation of operations)
            expect(operation).toThrow("effect_in_teardown");
        });
        expect(owner.context).toBeUndefined();
        expect(frame.active).toBe(false);
        expect(() => getContext<string>("key")).toThrow();
      });
      expect(calls).toBe(0);
    });

test("ordinary native disposal still clears context and independent roots keep their existing semantics", () => {
  let owner!: Owner,
    calls = 0;
  const stop = createRoot((dispose) => {
    owner = getOwner()!;
    onBeforeDispose(() => onAfterDispose(() => calls++));
    return dispose;
  });
  stop();
  expect(owner.disposed).toBe(true);
  expect(owner.context).toBeUndefined();
  expect(calls).toBe(1);
  runWithOwner(owner, () =>
    createRoot((dispose) => {
      calls++;
      dispose();
    }),
  );
  expect(calls).toBe(2);
});
