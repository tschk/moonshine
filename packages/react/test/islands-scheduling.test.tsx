import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import ReactDOM from "react-dom/client";
import { hydrateIslands } from "../src/islands";
import { cleanup, click } from "./dom";

const scope = globalThis as unknown as Record<string, unknown>;
const original = {
  IntersectionObserver: scope.IntersectionObserver,
  requestIdleCallback: scope.requestIdleCallback,
  cancelIdleCallback: scope.cancelIdleCallback,
  reportError: scope.reportError,
};
let dispose = () => {};
let restoreHydration = () => {};

afterEach(async () => {
  dispose();
  restoreHydration();
  Object.assign(scope, original);
  await cleanup();
});

function marker(mode?: string): Element {
  document.body.innerHTML = `
    <script data-moonshine-island-modules type="application/json">${JSON.stringify({ counter: new URL("./fixtures/Counter.tsx", import.meta.url).href })}</script>
    <div data-moonshine-island="counter"${mode ? ` data-moonshine-hydrate="${mode}"` : ""}><button>3</button></div>
    <script data-moonshine-island-props="counter" type="application/json">{"start":3}</script>`;
  return document.querySelector("[data-moonshine-island]")!;
}

function hydrationSpy() {
  const spy = spyOn(ReactDOM, "hydrateRoot").mockImplementation(
    () =>
      ({ unmount() {}, render() {} }) as ReturnType<
        typeof ReactDOM.hydrateRoot
      >,
  );
  restoreHydration = () => spy.mockRestore();
  return spy;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("island hydration scheduling", () => {
  test("hydrates default eager islands", async () => {
    const element = marker();
    const hydrate = hydrationSpy();
    dispose = hydrateIslands();
    await flush();
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(hydrate.mock.calls[0]![0]).toBe(element);
  });

  test("waits for visibility, hydrates once and disconnects", async () => {
    const element = marker("visible");
    const hydrate = hydrationSpy();
    let notify!: IntersectionObserverCallback;
    const disconnect = spyOn({ disconnect() {} }, "disconnect");
    scope.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe(target: Element) {
        expect(target).toBe(element);
      }
      disconnect = disconnect;
    };
    dispose = hydrateIslands();
    await flush();
    expect(hydrate).not.toHaveBeenCalled();
    const deliver = (isIntersecting: boolean) =>
      notify(
        [{ target: element, isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    deliver(false);
    await flush();
    expect(hydrate).not.toHaveBeenCalled();
    deliver(true);
    deliver(true);
    await flush();
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
  });

  test("waits for idle with bounded timeout and cancels pending work", async () => {
    marker("idle");
    const hydrate = hydrationSpy();
    let idle!: IdleRequestCallback;
    scope.requestIdleCallback = (
      callback: IdleRequestCallback,
      options: IdleRequestOptions,
    ) => {
      idle = callback;
      expect(options.timeout).toBe(2000);
      return 7;
    };
    const cancel = spyOn({ cancel(_handle: number) {} }, "cancel");
    scope.cancelIdleCallback = cancel;
    dispose = hydrateIslands();
    await flush();
    expect(hydrate).not.toHaveBeenCalled();
    idle({} as IdleDeadline);
    await flush();
    expect(hydrate).toHaveBeenCalledTimes(1);
    dispose();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  test("cleanup prevents delayed observers and idle callbacks from hydrating", async () => {
    for (const mode of ["visible", "idle"]) {
      marker(mode);
      let trigger!: () => void;
      scope.IntersectionObserver = class {
        constructor(callback: IntersectionObserverCallback) {
          trigger = () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              {} as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      };
      scope.requestIdleCallback = (callback: IdleRequestCallback) => {
        trigger = () => callback({} as IdleDeadline);
        return 7;
      };
      scope.cancelIdleCallback = () => {};
      const hydrate = hydrationSpy();
      dispose = hydrateIslands();
      dispose();
      trigger();
      await flush();
      expect(hydrate).not.toHaveBeenCalled();
      restoreHydration();
    }
  });

  test("falls back when scheduling APIs are unavailable", async () => {
    scope.IntersectionObserver = undefined;
    scope.requestIdleCallback = undefined;
    for (const mode of ["visible", "idle"]) {
      marker(mode);
      const hydrate = hydrationSpy();
      dispose = hydrateIslands();
      await flush();
      expect(hydrate).toHaveBeenCalledTimes(1);
      dispose();
      restoreHydration();
    }
  });

  test("repeated calls do not schedule or hydrate the same marker twice", async () => {
    marker("idle");
    const hydrate = hydrationSpy();
    let scheduled = 0;
    let idle!: IdleRequestCallback;
    scope.requestIdleCallback = (callback: IdleRequestCallback) => {
      scheduled++;
      idle = callback;
      return 1;
    };
    scope.cancelIdleCallback = () => {};
    dispose = hydrateIslands();
    const disposeAgain = hydrateIslands();
    expect(scheduled).toBe(1);
    idle({} as IdleDeadline);
    await flush();
    const disposeAfterHydration = hydrateIslands();
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(scheduled).toBe(1);
    disposeAgain();
    disposeAfterHydration();
  });

  test("same-component instances hydrate with their own props", async () => {
    marker();
    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div data-moonshine-island="counter"><button>9</button></div>
      <script data-moonshine-island-props="counter" type="application/json">{"start":9}</script>`,
    );
    const hydrate = hydrationSpy();
    dispose = hydrateIslands();
    await flush();
    expect(hydrate).toHaveBeenCalledTimes(2);
    expect(
      hydrate.mock.calls.map(
        (call) => (call[1] as { props: { start: number } }).props.start,
      ),
    ).toEqual([3, 9]);
  });

  test("reports failed module imports using console.error if reportError is absent", async () => {
    marker();
    const modules = document.querySelector(
      "script[data-moonshine-island-modules]",
    )!;
    modules.textContent = JSON.stringify({
      counter: "./missing-island-fixture.tsx",
    });

    const originalReportError = scope.reportError;
    scope.reportError = undefined;
    const errors: unknown[][] = [];
    const errorSpy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });

    try {
      dispose = hydrateIslands();
      await flush();
      expect(errors).toHaveLength(1);
      expect(errors[0][0]).toBe("Moonshine island hydration failed");
    } finally {
      errorSpy.mockRestore();
      scope.reportError = originalReportError;
    }
  });

  test("reports failed module imports and allows a retry", async () => {
    marker();
    const modules = document.querySelector(
      "script[data-moonshine-island-modules]",
    )!;
    const valid = modules.textContent;
    modules.textContent = JSON.stringify({
      counter: "./missing-island-fixture.tsx",
    });
    const errors: unknown[] = [];
    scope.reportError = (error: unknown) => errors.push(error);
    const hydrate = hydrationSpy();
    dispose = hydrateIslands();
    await flush();
    expect(errors).toHaveLength(1);
    expect(hydrate).not.toHaveBeenCalled();
    dispose();
    modules.textContent = valid;
    dispose = hydrateIslands();
    await flush();
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  test("a visible island reuses SSR markup and handles a real counter click", async () => {
    const element = marker("visible");
    const button = element.querySelector("button")!;
    document.querySelector(
      "script[data-moonshine-island-modules]",
    )!.textContent = JSON.stringify({
      counter: new URL("./fixtures/HydrationCounter.tsx", import.meta.url).href,
    });
    let visible!: () => void;
    scope.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        visible = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
      }
      observe() {}
      disconnect() {}
    };
    const realHydrate = ReactDOM.hydrateRoot;
    let root: ReturnType<typeof ReactDOM.hydrateRoot> | undefined;
    const spy = spyOn(ReactDOM, "hydrateRoot").mockImplementation((...args) => {
      root = realHydrate(...args);
      return root;
    });
    restoreHydration = () => spy.mockRestore();
    try {
      dispose = hydrateIslands();
      await click(button);
      expect(button.textContent).toBe("3");
      visible();
      await flush();
      expect(element.querySelector("button")).toBe(button);
      await click(button);
      expect(button.textContent).toBe("4");
    } finally {
      await act(async () => root?.unmount());
    }
  });
});
