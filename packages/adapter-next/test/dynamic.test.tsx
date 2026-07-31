import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { act } from "react";
import dynamic from "../src/dynamic";
import { render, cleanup } from "./dom";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Hello({ name }: { name: string }) {
  return createElement("span", { id: "hello" }, `Hello ${name}`);
}

function Loading() {
  return createElement("span", { id: "loading" }, "Loading...");
}

describe("next/dynamic", () => {
  afterEach(cleanup);

  test("shows the loading fallback, then the component", async () => {
    const gate = deferred<{ default: typeof Hello }>();
    const Lazy = dynamic(() => gate.promise, { loading: Loading });

    const container = await render(createElement(Lazy, { name: "moon" }));
    expect(container.querySelector("#loading")?.textContent).toBe("Loading...");
    expect(container.querySelector("#hello")).toBeNull();

    await act(async () => {
      gate.resolve({ default: Hello });
      await gate.promise;
    });

    expect(container.querySelector("#loading")).toBeNull();
    expect(container.querySelector("#hello")?.textContent).toBe("Hello moon");
  });

  test("renders nothing while loading when no fallback is given", async () => {
    const gate = deferred<{ default: typeof Hello }>();
    const Lazy = dynamic(() => gate.promise);
    const container = await render(createElement(Lazy, { name: "x" }));
    expect(container.textContent).toBe("");
    await act(async () => {
      gate.resolve({ default: Hello });
      await gate.promise;
    });
    expect(container.querySelector("#hello")?.textContent).toBe("Hello x");
  });

  test("accepts a module without a default export", async () => {
    const Lazy = dynamic(async () => Hello);
    const container = await render(createElement(Lazy, { name: "bare" }));
    expect(container.querySelector("#hello")?.textContent).toBe("Hello bare");
  });

  test("the loader runs once even across preload and render", async () => {
    let calls = 0;
    const Lazy = dynamic(async () => {
      calls++;
      return { default: Hello };
    });

    await Lazy.preload();
    await Lazy.preload();
    await render(createElement(Lazy, { name: "once" }));
    expect(calls).toBe(1);
  });

  test("preload resolves to the loaded module", async () => {
    const Lazy = dynamic(async () => ({ default: Hello }));
    expect((await Lazy.preload()).default).toBe(Hello);
  });

  test("ssr:false renders only the fallback without a document", async () => {
    const Lazy = dynamic(async () => ({ default: Hello }), {
      ssr: false,
      loading: Loading,
    });
    const realWindow = globalThis.window;
    // The component branches on `typeof window`, so emulate the server here.
    Reflect.deleteProperty(globalThis, "window");
    try {
      const rendered = (Lazy as (props: { name: string }) => unknown)({
        name: "server",
      });
      expect(rendered).toEqual(createElement(Loading));
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: realWindow,
        configurable: true,
        writable: true,
      });
    }
  });
});
