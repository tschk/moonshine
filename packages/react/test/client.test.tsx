import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createSignal, createStore } from "@tschk/moonshine";
import { useSignal, useStore } from "../src/client";
import { cleanup, render } from "./dom";

describe("client hooks", () => {
  afterEach(cleanup);

  test("useSignal re-renders when the signal changes", async () => {
    const sig = createSignal(1);
    let renders = 0;
    function Probe() {
      renders++;
      return <div>{useSignal(sig)}</div>;
    }

    const container = await render(<Probe />);
    expect(container.textContent).toBe("1");
    expect(renders).toBe(1);

    await act(async () => {
      sig.set(2);
    });

    expect(container.textContent).toBe("2");
    expect(renders).toBe(2);
  });

  test("useStore re-renders when the store changes", async () => {
    const [store, setStore] = createStore({ count: 1 });
    let renders = 0;
    function Probe() {
      renders++;
      const state = useStore(store);
      return <div>{state.count}</div>;
    }

    const container = await render(<Probe />);
    expect(container.textContent).toBe("1");
    expect(renders).toBe(1);

    await act(async () => {
      setStore((state) => {
        state.count = 2;
      });
    });

    expect(container.textContent).toBe("2");
    expect(renders).toBe(2);
  });

  test("useStore throws for a plain object", async () => {
    function Probe() {
      useStore({ not: "a store" });
      return null;
    }

    const silent = console.error;
    console.error = () => {};
    let error: unknown;
    try {
      await render(<Probe />);
    } catch (caught) {
      error = caught;
    } finally {
      console.error = silent;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "useStore: expected a createStore() proxy",
    );
  });
});
