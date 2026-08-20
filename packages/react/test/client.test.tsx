import { describe, expect, test, afterEach } from "bun:test";
import { act } from "react";
import { createSignal, createStore, createResource } from "@tschk/moonshine";
import { useSignal, useStore, useResource } from "../src/client";
import { render, cleanup } from "./dom";

describe("client hooks", () => {
  afterEach(cleanup);

  describe("useSignal", () => {
    test("reads and subscribes to a signal", async () => {
      const sig = createSignal(1);

      let renderCount = 0;
      function TestComponent() {
        renderCount++;
        const val = useSignal(sig);
        return <div>{val}</div>;
      }

      const container = await render(<TestComponent />);
      expect(container.textContent).toBe("1");
      expect(renderCount).toBe(1);

      await act(async () => {
        sig.set(2);
      });

      expect(container.textContent).toBe("2");
      expect(renderCount).toBe(2);
    });

    test("reads getServerSnapshot if provided", async () => {
      const sig = createSignal(1);

      function TestComponent() {
        const val = useSignal(sig, () => 42);
        return <div>{val}</div>;
      }

      const container = await render(<TestComponent />);
      expect(container.textContent).toBe("1");
    });
  });

  describe("useStore", () => {
    test("reads and subscribes to a store", async () => {
      const [store, setStore] = createStore({ count: 1 });

      let renderCount = 0;
      function TestComponent() {
        renderCount++;
        const state = useStore(store);
        return <div>{state.count}</div>;
      }

      const container = await render(<TestComponent />);
      expect(container.textContent).toBe("1");
      expect(renderCount).toBe(1);

      await act(async () => {
        setStore((state) => {
          state.count = 2;
        });
      });

      expect(container.textContent).toBe("2");
      expect(renderCount).toBe(2);
    });

    test("throws if not passed a createStore proxy", async () => {
      function TestComponent() {
        useStore({ not: "a store" });
        return null;
      }

      let error: Error | undefined;
      const originalConsoleError = console.error;
      console.error = () => {};
      try {
        await render(<TestComponent />);
      } catch (e) {
        error = e as Error;
      } finally {
        console.error = originalConsoleError;
      }
      expect(error?.message).toBe("useStore: expected a createStore() proxy");
    });
  });

  describe("useResource", () => {
    test("reads and subscribes to a resource", async () => {
      let resolve: (val: string) => void;
      const promise = new Promise<string>((r) => {
        resolve = r;
      });
      const resource = createResource(() => promise);

      function TestComponent() {
        const res = useResource(resource);
        return (
          <div>
            <span data-testid="status">{res.status}</span>
            <span data-testid="loading">{String(res.loading)}</span>
            <span data-testid="data">{res.data || "none"}</span>
          </div>
        );
      }

      const container = await render(<TestComponent />);
      expect(
        container.querySelector('[data-testid="status"]')?.textContent,
      ).toBe("pending");
      expect(
        container.querySelector('[data-testid="loading"]')?.textContent,
      ).toBe("true");
      expect(container.querySelector('[data-testid="data"]')?.textContent).toBe(
        "none",
      );

      await act(async () => {
        resolve!("done");
        await promise;
      });

      expect(
        container.querySelector('[data-testid="status"]')?.textContent,
      ).toBe("ready");
      expect(
        container.querySelector('[data-testid="loading"]')?.textContent,
      ).toBe("false");
      expect(container.querySelector('[data-testid="data"]')?.textContent).toBe(
        "done",
      );
    });
  });
});