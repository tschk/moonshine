import { expect, test } from "bun:test";
import {
  catchError,
  createEffect,
  createContext,
  useContext,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  type Owner,
} from "../src/solid";
import { createComputed } from "@tschk/moonshine-dom/reactive";

test("owner callbacks are untracked and restore outer dependency collection", () => {
  const [inside, setInside] = createSignal(0);
  const [outside, setOutside] = createSignal(0);
  let runs = 0;
  const stop = createRoot((dispose) => {
    const scope = getOwner();
    const memo = createMemo(() => {
      runs++;
      runWithOwner(scope, () => inside());
      return outside();
    });
    expect(memo()).toBe(0);
    setInside(1);
    expect(memo()).toBe(0);
    expect(runs).toBe(1);
    setOutside(2);
    expect(memo()).toBe(2);
    expect(runs).toBe(2);
    return dispose;
  });
  stop();
  expect(getOwner()).toBeNull();
});

test("captured owners retain effects and cleanup across an await", async () => {
  let scope: Owner | null = null;
  const [value, setValue] = createSignal(0);
  const seen: number[] = [];
  let cleaned = 0;
  const stop = createRoot((dispose) => {
    scope = getOwner();
    return dispose;
  });
  await Promise.resolve();
  expect(getOwner()).toBeNull();
  const result = runWithOwner(scope, () => {
    expect(getOwner()).toBe(scope);
    onCleanup(() => cleaned++);
    createEffect(() => {
      seen.push(value());
    });
    return "resumed";
  });
  expect(result).toBe("resumed");
  expect(seen).toEqual([0]);
  setValue(1);
  expect(seen).toEqual([0, 1]);
  stop();
  setValue(2);
  expect(seen).toEqual([0, 1]);
  expect(cleaned).toBe(1);
  expect(getOwner()).toBeNull();
});

test("owner callbacks publish computations and restore the previous owner after failure", () => {
  const [value, setValue] = createSignal(0);
  const seen: number[] = [];
  let captured: Owner | null = null;
  const stop = createRoot((dispose) => {
    captured = getOwner();
    createComputed(() => {
      seen.push(value());
    });
    return dispose;
  });
  runWithOwner(captured, () => {
    setValue(1);
    setValue(2);
  });
  expect(seen).toEqual([0, 1, 2]);
  const failure = Error("callback");
  expect(() =>
    runWithOwner(captured, () => {
      throw failure;
    }),
  ).toThrow(failure);
  expect(getOwner()).toBeNull();
  expect(runWithOwner(null, () => getOwner())).toBeNull();
  stop();
});

test("callback failures route through the captured error owner", () => {
  const seen: string[] = [];
  let captured: Owner | null = null;
  const stop = createRoot((dispose) => {
    catchError(
      () => {
        captured = getOwner();
      },
      (error) => seen.push(error.message),
    );
    return dispose;
  });
  const result = runWithOwner(captured, () => {
    throw Error("resumed");
  });
  expect(result).toBeUndefined();
  expect(seen).toEqual(["resumed"]);
  expect(getOwner()).toBeNull();
  stop();
});

test("disposed owners cannot acquire new work", () => {
  let captured: Owner | null = null;
  const stop = createRoot((dispose) => {
    captured = getOwner();
    return dispose;
  });
  stop();
  expect(() => runWithOwner(captured, () => createEffect(() => {}))).toThrow(
    "disposed native owner",
  );
  expect(getOwner()).toBeNull();
});

test("owner callback starts new effects after setup and retains provider context", async () => {
  const Context = createContext("default");
  const trace: string[] = [];
  let captured: Owner | null = null;
  const stop = createRoot((dispose) => {
    const child = Context.Provider({
      value: "provider",
      get children() {
        captured = getOwner();
        return "child";
      },
    });
    child();
    return dispose;
  });
  await Promise.resolve();
  runWithOwner(captured, () => {
    trace.push("before:" + useContext(Context));
    createEffect(() => {
      trace.push("effect:" + useContext(Context));
    });
    trace.push("after");
  });
  expect(trace).toEqual(["before:provider", "after", "effect:provider"]);
  stop();
});
