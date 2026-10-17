import { expect, test } from "bun:test";
import {
  boundary,
  defer,
  h,
  renderToString,
  scopeSSRChild,
} from "@tschk/moonshine-dom/ssr";
import {
  createRoot,
  getOwner,
  runWithOwner,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { createRuneEffect, createRuneRoot } from "../src/effect";
import { onDestroy, onMount } from "../src/svelte";
import { createState } from "../src/state";

function clientCallbacks(trace: string[]) {
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    createRuneEffect(() => {
      trace.push("effect");
    });
    onMount(() => {
      trace.push("mount");
    });
    onDestroy(() => {
      trace.push("destroy");
    });
  });
  return stop;
}

test("bare and nested SSR suppress rune root factories, effects and mounts", async () => {
  const trace: string[] = [];
  expect(
    renderToString(() => {
      const stop = createRuneRoot(() => {
        trace.push("root");
      });
      stop();
      stop();
      createRuneEffect(() => {
        trace.push("effect");
      });
      onMount(() => {
        trace.push("mount");
      });
      onDestroy(() => {
        trace.push("destroy");
      });
      expect(
        renderToString(() => {
          createRuneRoot(() => {
            trace.push("nested root");
          });
          return "nested";
        }),
      ).toBe("nested");
      expect(isSSRRendering()).toBe(true);
      return h("p", null, "server");
    }),
  ).toBe("<p>server</p>");
  await Promise.resolve();
  expect(trace).toEqual(["destroy"]);
  expect(isSSRRendering()).toBe(false);
  // Root remains callable without an owner outside SSR.
  const stop = createRuneRoot(() => {
    trace.push("client root");
    return () => {
      trace.push("root cleanup");
    };
  });
  stop();
  expect(trace).toEqual(["destroy", "client root", "root cleanup"]);
});

test("retained foreign SSR owners do not queue client callbacks after serialization", async () => {
  let owner!: Owner, stop!: () => void;
  createRoot((dispose) => {
    owner = getOwner()!;
    stop = dispose;
  });
  const trace: string[] = [];
  const child = runWithOwner(owner, () =>
    scopeSSRChild(
      defer(() => {
        createRuneRoot(() => {
          trace.push("root");
        });
        createRuneEffect(() => {
          trace.push("effect");
        });
        onMount(() => {
          trace.push("mount");
        });
        onDestroy(() => {
          trace.push("destroy");
        });
        return h("p", null, "foreign");
      }),
    ),
  );
  try {
    expect(renderToString(() => child)).toBe("<p>foreign</p>");
    expect(owner.disposed).toBe(false);
    await Promise.resolve();
    expect(trace).toEqual([]);
  } finally {
    stop();
  }
  expect(trace).toEqual(["destroy"]);
});

test("bare SSR destroy observes accepted attempts and stays live during server teardown", () => {
  const trace: string[] = [];
  expect(
    renderToString(() =>
      boundary(
        () =>
          defer(() => {
            onDestroy(() => {
              trace.push("discarded");
            });
            throw new Error("discard attempt");
          }),
        () =>
          defer(() => {
            onDestroy(() => {
              trace.push("accepted");
            });
            return h("b", null, "fallback");
          }),
      ),
    ),
  ).toBe("<b>fallback</b>");
  expect(trace).toEqual(["accepted"]);
  const value = createState(1);
  expect(value.value).toBe(1);
  value.value = 2;
  renderToString(() => {
    onDestroy(() => {
      expect(value.value).toBe(2);
    });
    return "live";
  });
});

test("render and cleanup failures restore SSR mode and preserve subsequent client callbacks", async () => {
  expect(() =>
    renderToString(() => {
      throw new Error("render failed");
    }),
  ).toThrow("render failed");
  expect(isSSRRendering()).toBe(false);
  expect(() =>
    renderToString(() => {
      onDestroy(() => {
        throw new Error("cleanup failed");
      });
      return "ok";
    }),
  ).toThrow("cleanup failed");
  expect(isSSRRendering()).toBe(false);
  const trace: string[] = [];
  const stop = clientCallbacks(trace);
  await Promise.resolve();
  expect(trace).toEqual(["effect", "mount"]);
  stop();
  expect(trace).toEqual(["effect", "mount", "destroy"]);
});

test("SSR suppression preserves live owner and component initialization validation", () => {
  expect(() => createRuneEffect(() => {})).toThrow("live native owner");
  expect(() => onMount(() => {})).toThrow("native component initialization");
  expect(() => onDestroy(() => {})).toThrow("native component initialization");
  let owner!: Owner;
  createRoot((stop) => {
    owner = getOwner()!;
    stop();
  });
  expect(() =>
    renderToString(() => runWithOwner(owner, () => createRuneEffect(() => {}))),
  ).toThrow("live native owner");
  expect(() =>
    renderToString(() => runWithOwner(owner, () => onMount(() => {}))),
  ).toThrow("native component initialization");
});
