import { queueCleanupFinalizer } from "../src/cleanup-finalization";
import { expect, test } from "bun:test";
import "../../react/test/dom";
import { h, createInsertionRange } from "@tschk/moonshine-dom/dom";
import {
  createComputed,
  createSignal,
  onCleanup,
  queuePostCommit,
} from "@tschk/moonshine-dom/reactive";
import { render, createRoot } from "../src/cleanup-policy";
test("nested cleanup new render may adopt a node in same or different container", () => {
  for (const same of [true, false]) {
    const old = document.createElement("div"),
      next = same ? old : document.createElement("div");
    document.body.append(old);
    if (!same) document.body.append(next);
    const node = document.createElement("button");
    let stopNew: (() => void) | undefined;
    const stop = render(() => {
      onCleanup(() => {
        stopNew = render(() => node, next);
      });
      return node;
    }, old);
    stop();
    expect(next.querySelector("button")).toBe(node);
    expect(node.isConnected).toBe(true);
    stopNew?.();
    expect(node.isConnected).toBe(false);
    old.remove();
    if (!same) next.remove();
  }
});
test("nested child and ancestor callbacks see connected nodes before final removal", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const trace: boolean[] = [];
  let child!: HTMLElement;
  const stop = render(() => {
    onCleanup(() => trace.push(child.isConnected));
    createComputed(() => {
      onCleanup(() => trace.push(child.isConnected));
    });
    child = h("button", null, "child");
    return child;
  }, container);
  stop();
  expect(trace).toEqual([true, true]);
  expect(child.isConnected).toBe(false);
  container.remove();
});
test("old DOM removal completes before computation replacement setup", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const [n, set] = createSignal(0);
  const trace: string[] = [];
  let old: HTMLElement | undefined;
  const stop = createRoot((dispose) => {
    createComputed(() => {
      const value = n();
      trace.push("setup" + value + ":" + !!old?.isConnected);
      const node = document.createElement("button");
      old = node;
      const stopDOM = render(() => {
        onCleanup(() => trace.push("cleanup" + value + ":" + node.isConnected));
        return node;
      }, container);
      onCleanup(stopDOM);
    });
    return dispose;
  });
  set(1);
  stop();
  expect(trace).toEqual([
    "setup0:false",
    "cleanup0:true",
    "setup1:false",
    "cleanup1:true",
  ]);
  container.remove();
});
test("callback and finalizer failures drain peers and preserve first actual error", () => {
  const callback = Error("callback"),
    finalizer = Error("finalizer"),
    trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() => {
      queueCleanupFinalizer(() => {
        trace.push("physical:first");
        throw finalizer;
      });
      queueCleanupFinalizer(() => trace.push("physical:peer"));
      trace.push("callback");
      throw callback;
    });
    return dispose;
  });
  expect(stop).toThrow(callback);
  expect(trace).toEqual(["callback", "physical:first", "physical:peer"]);
  const stop2 = createRoot((dispose) => {
    onCleanup(() => {
      queueCleanupFinalizer(() => {
        trace.push("onlyfinal");
        throw finalizer;
      });
      queueCleanupFinalizer(() => trace.push("onlypeer"));
    });
    return dispose;
  });
  expect(stop2).toThrow(finalizer);
  expect(trace.slice(-2)).toEqual(["onlyfinal", "onlypeer"]);
});
test("explicit insertion range resource disposal remains immediate and connectivity is observed", () => {
  const container = document.createElement("div");
  document.body.append(container);
  let node!: HTMLElement;
  const seen: boolean[] = [];
  const stop = render(() => {
    const range = createInsertionRange(() => {
      node = h("button", null, "range");
      return node;
    });
    onCleanup(() => seen.push(node.isConnected));
    return range;
  }, container);
  stop();
  expect(seen).toEqual([true]);
  expect(node.isConnected).toBe(false);
  container.remove();
});
test("default native outer cleanup drains opted child physical finalizers", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const { createRoot: nativeRoot } = require("@tschk/moonshine-dom/reactive");
  const stop = nativeRoot((dispose: () => void) => {
    const stopChild = render(() => h("button", null, "child"), container);
    onCleanup(stopChild);
    return dispose;
  });
  stop();
  expect(container.querySelector("button")).toBeNull();
  container.remove();
});
test("bounded reentrant finalizer feedback drains without recursive callback stack", () => {
  const seen: number[] = [];
  function next(n: number) {
    seen.push(n);
    if (n < 32) queueCleanupFinalizer(() => next(n + 1));
  }
  const stop = createRoot((dispose) => {
    onCleanup(() => queueCleanupFinalizer(() => next(0)));
    return dispose;
  });
  stop();
  expect(seen).toEqual(Array.from({ length: 33 }, (_, i) => i));
});
test("fresh finalizer waves are bounded while a large independent cohort drains", () => {
  let waves = 0,
    peers = 0;
  const next = () => {
    waves++;
    if (waves < 2005) queueCleanupFinalizer(() => next());
  };
  const stop = createRoot((dispose) => {
    onCleanup(() => {
      queueCleanupFinalizer(() => next());
      queueCleanupFinalizer(() => peers++);
    });
    return dispose;
  });
  expect(stop).toThrow("cleanup finalizer update limit");
  expect(waves).toBe(1000);
  expect(peers).toBe(1);
  let independent = 0;
  const recover = createRoot((dispose) => {
    onCleanup(() => {
      for (let i = 0; i < 1500; i++) queueCleanupFinalizer(() => independent++);
    });
    return dispose;
  });
  recover();
  expect(independent).toBe(1500);
});
test("finalizer wave failures preserve the first error, drain current peers and recover", () => {
  const original = Error("first");
  let runs = 0,
    peers = 0;
  const next = () => {
    runs++;
    queueCleanupFinalizer(() => next());
  };
  const stop = createRoot((dispose) => {
    onCleanup(() => {
      queueCleanupFinalizer(() => {
        throw original;
      });
      queueCleanupFinalizer(() => next());
      queueCleanupFinalizer(() => peers++);
    });
    return dispose;
  });
  expect(stop).toThrow(original);
  expect(runs).toBe(1000);
  expect(peers).toBe(1);
  let recovered = false;
  const recover = createRoot((dispose) => {
    onCleanup(() =>
      queueCleanupFinalizer(() => {
        recovered = true;
      }),
    );
    return dispose;
  });
  recover();
  expect(recovered).toBe(true);
});
test("fixed native finalizer slot cannot evade its wave bound with fresh function identities", async () => {
  const { requestCleanupFinalizerFlush } =
    await import("@tschk/moonshine-dom/reactive");
  let waves = 0;
  const next = () => {
    waves++;
    if (waves < 2005) requestCleanupFinalizerFlush(() => next());
  };
  const stop = createRoot((dispose) => {
    onCleanup(() => requestCleanupFinalizerFlush(() => next()));
    return dispose;
  });
  expect(stop).toThrow("Native cleanup finalizer update limit");
  expect(waves).toBe(1000);
  let recovered = false;
  const recover = createRoot((dispose) => {
    onCleanup(() =>
      requestCleanupFinalizerFlush(() => {
        recovered = true;
      }),
    );
    return dispose;
  });
  recover();
  expect(recovered).toBe(true);
});
test("live insertion range replacement keeps old cleanup connected and removes it before update returns", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const [show, setShow] = createSignal(true);
  const trace: string[] = [];
  let node!: HTMLElement;
  const stop = render(() => {
    const row = createInsertionRange(() => {
      node = h("button", null, "old");
      onCleanup(() => trace.push("cleanup:" + node.isConnected));
      return node;
    });
    return h("section", null, () =>
      show() ? row : (trace.push("replacement:" + node.isConnected), "next"),
    );
  }, container);
  setShow(false);
  expect(trace).toEqual(["replacement:true", "cleanup:true"]);
  expect(node.isConnected).toBe(false);
  expect(container.textContent).toBe("next");
  stop();
  container.remove();
});
test("nested owner cleanup cannot reset the fixed finalizer transaction wave bound", async () => {
  const { requestCleanupFinalizerFlush } =
    await import("@tschk/moonshine-dom/reactive");
  let waves = 0;
  const next = () => {
    waves++;
    if (waves < 2005) {
      requestCleanupFinalizerFlush(() => next());
      const nested = createRoot((dispose) => {
        onCleanup(() => {});
        return dispose;
      });
      nested();
    }
  };
  const stop = createRoot((dispose) => {
    onCleanup(() => requestCleanupFinalizerFlush(() => next()));
    return dispose;
  });
  expect(stop).toThrow("Native cleanup finalizer update limit");
  expect(waves).toBe(1000);
  let recovered = false;
  const recover = createRoot((dispose) => {
    onCleanup(() =>
      requestCleanupFinalizerFlush(() => {
        recovered = true;
      }),
    );
    return dispose;
  });
  recover();
  expect(recovered).toBe(true);
});
test("live range removal drains throwing resources, preserves the first failure and allows adoption", () => {
  const host = document.createElement("div"),
    next = document.createElement("div");
  document.body.append(host, next);
  const [show, setShow] = createSignal(true);
  const error = Error("range resource");
  let button!: HTMLElement,
    stopNext = () => {};
  const seen: boolean[] = [];
  const stop = render(() => {
    const row = createInsertionRange(() => {
      button = h("button", null, "adopt");
      onCleanup(() => seen.push(button.isConnected));
      onCleanup(() => {
        stopNext = render(() => button, next);
        throw error;
      });
      return button;
    });
    return h("section", null, () => (show() ? row : null));
  }, host);
  expect(() => setShow(false)).toThrow(error);
  expect(seen).toEqual([true]);
  expect(next.querySelector("button")).toBe(button);
  expect(button.isConnected).toBe(true);
  stop();
  stopNext();
  expect(button.isConnected).toBe(false);
  host.remove();
  next.remove();
});

test("postcommit waits for physical peers even when a finalizer disposes another owner", () => {
  const trace: string[] = [];
  const stop = createRoot((dispose) => {
    onCleanup(() => {
      queueCleanupFinalizer(() => {
        trace.push("physical:first");
        queuePostCommit(() => trace.push("post"));
        const nested = createRoot((end) => {
          onCleanup(() => {});
          return end;
        });
        nested();
      });
      queueCleanupFinalizer(() => trace.push("physical:peer"));
    });
    return dispose;
  });
  stop();
  expect(trace).toEqual(["physical:first", "physical:peer", "post"]);
});
test("throwing finalizer still drains physical peers before postcommit and preserves its error", () => {
  const trace: string[] = [];
  const error = Error("physical");
  const stop = createRoot((dispose) => {
    onCleanup(() => {
      queueCleanupFinalizer(() => {
        trace.push("physical:first");
        queuePostCommit(() => trace.push("post"));
        const nested = createRoot((end) => {
          onCleanup(() => {});
          return end;
        });
        nested();
        throw error;
      });
      queueCleanupFinalizer(() => trace.push("physical:peer"));
    });
    return dispose;
  });
  let failure: unknown;
  try {
    stop();
  } catch (caught) {
    failure = caught;
  }
  expect(failure).toBe(error);
  expect(trace).toEqual(["physical:first", "physical:peer", "post"]);
});
