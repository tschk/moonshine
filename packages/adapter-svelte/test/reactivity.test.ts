import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { withSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  MediaQuery,
  ReactiveValue,
  SvelteDate,
  SvelteMap,
  SvelteSet,
  SvelteURL,
  SvelteURLSearchParams,
  createSubscriber,
} from "../src/reactivity";
import { createRunePreEffect, withRuneScheduler } from "../src/pre";
import * as reactiveWindow from "../src/reactivity-window";
import { createDerived, createRuneEffect, createState } from "../src/runes";
import {
  createServerDerived,
  getAbortSignal as getServerAbortSignal,
} from "../src/ssr";
import { getAbortSignal, tick } from "../src/svelte";

describe("@tschk/moonshine-svelte/reactivity", () => {
  test("createSubscriber starts on first tracked consumer, shares active subscription, and cleans up after disposal", async () => {
    let starts = 0;
    let stops = 0;
    let triggerUpdate: (() => void) | undefined;
    let count = 0;

    const subscribe = createSubscriber((update) => {
      starts++;
      triggerUpdate = update;
      return () => {
        stops++;
      };
    });

    const readValue = () => {
      subscribe();
      return count;
    };

    // Untracked read and SSR read do not start the subscription
    expect(readValue()).toBe(0);
    expect(starts).toBe(0);
    withSSRRendering(() => {
      expect(readValue()).toBe(0);
    });
    expect(starts).toBe(0);

    const seenA: number[] = [];
    const seenB: number[] = [];
    let stopA!: () => void;
    let stopB!: () => void;

    createRoot((dispose) => {
      stopA = dispose;
      createRuneEffect(() => {
        seenA.push(readValue());
      });
    });
    createRoot((dispose) => {
      stopB = dispose;
      createRuneEffect(() => {
        seenB.push(readValue());
      });
    });

    await tick();
    expect(starts).toBe(1);
    expect(stops).toBe(0);
    expect(seenA).toEqual([0]);
    expect(seenB).toEqual([0]);

    count = 5;
    triggerUpdate!();
    await tick();
    expect(seenA).toEqual([0, 5]);
    expect(seenB).toEqual([0, 5]);

    stopA();
    await Promise.resolve();
    expect(stops).toBe(0);

    stopB();
    await Promise.resolve();
    expect(stops).toBe(1);
  });

  test("MediaQuery normalizes queries, updates reactively, and uses fallback in SSR", async () => {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const queries: string[] = [];
    let matches = false;
    const listeners = new Set<() => void>();

    (globalThis as { window?: unknown }).window = {
      matchMedia(q: string) {
        queries.push(q);
        return {
          get matches() {
            return matches;
          },
          addEventListener(_type: string, fn: () => void) {
            listeners.add(fn);
          },
          removeEventListener(_type: string, fn: () => void) {
            listeners.delete(fn);
          },
        };
      },
    };

    try {
      const mq = new MediaQuery("min-width: 800px", true);
      const screenMq = new MediaQuery("screen");
      expect(queries).toEqual(["(min-width: 800px)", "screen"]);

      withSSRRendering(() => {
        expect(mq.current).toBe(true);
        expect(screenMq.current).toBe(false);
      });

      const seen: boolean[] = [];
      let stop!: () => void;
      createRoot((dispose) => {
        stop = dispose;
        createRuneEffect(() => {
          seen.push(mq.current);
        });
      });
      await tick();
      expect(seen).toEqual([false]);
      expect(listeners.size).toBe(1);

      matches = true;
      for (const listener of listeners) listener();
      await tick();
      expect(seen).toEqual([false, true]);

      stop();
      await Promise.resolve();
      expect(listeners.size).toBe(0);
    } finally {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  });

  test("SvelteDate tracks time reads and mutations", () => {
    const date = new SvelteDate("2026-01-01T00:00:00.000Z");
    let runs = 0;
    const year = createDerived(() => {
      runs++;
      return date.getUTCFullYear();
    });

    expect(year.value).toBe(2026);
    expect(runs).toBe(1);

    // Setting the exact same year does not bump version
    date.setUTCFullYear(2026);
    expect(year.value).toBe(2026);
    expect(runs).toBe(1);

    date.setUTCFullYear(2030);
    expect(year.value).toBe(2030);
    expect(runs).toBe(2);
  });

  test("SvelteSet tracks membership, size, and iteration", () => {
    const set = new SvelteSet(["a", "b"]);
    let hasARuns = 0;
    let sizeRuns = 0;

    const hasA = createDerived(() => {
      hasARuns++;
      return set.has("a");
    });
    const size = createDerived(() => {
      sizeRuns++;
      return set.size;
    });

    expect(hasA.value).toBe(true);
    expect(size.value).toBe(2);
    expect(hasARuns).toBe(1);
    expect(sizeRuns).toBe(1);

    // Deleting "b" updates size, but not has("a")
    set.delete("b");
    expect(size.value).toBe(1);
    expect(sizeRuns).toBe(2);
    expect(hasA.value).toBe(true);
    expect(hasARuns).toBe(1);

    set.delete("a");
    expect(hasA.value).toBe(false);
    expect(hasARuns).toBe(2);

    set.add("c");
    set.clear();
    expect(size.value).toBe(0);
  });

  test("SvelteMap isolates key value updates from structural size/keys reads", () => {
    const map = new SvelteMap<string, number>([
      ["a", 1],
      ["b", 2],
    ]);
    let getARuns = 0;
    let getBRuns = 0;
    let keysRuns = 0;
    let valuesRuns = 0;

    const valA = createDerived(() => {
      getARuns++;
      return map.get("a");
    });
    const valB = createDerived(() => {
      getBRuns++;
      return map.get("b");
    });
    const keysList = createDerived(() => {
      keysRuns++;
      return Array.from(map.keys()).join(",");
    });
    const sumValues = createDerived(() => {
      valuesRuns++;
      let sum = 0;
      for (const v of map.values()) sum += v;
      return sum;
    });

    expect(valA.value).toBe(1);
    expect(valB.value).toBe(2);
    expect(keysList.value).toBe("a,b");
    expect(sumValues.value).toBe(3);

    // Updating an existing key's value notifies get("a") and values(), but NOT get("b") or keys()
    map.set("a", 10);
    expect(valA.value).toBe(10);
    expect(getARuns).toBe(2);
    expect(valB.value).toBe(2);
    expect(getBRuns).toBe(1);
    expect(keysList.value).toBe("a,b");
    expect(keysRuns).toBe(1);
    expect(sumValues.value).toBe(12);
    expect(valuesRuns).toBe(2);

    // Adding a new key notifies keys() and values()
    map.set("c", 5);
    expect(keysList.value).toBe("a,b,c");
    expect(keysRuns).toBe(2);
    expect(sumValues.value).toBe(17);
    expect(valuesRuns).toBe(3);
  });

  test("SvelteURL and SvelteURLSearchParams stay reactively synchronized", () => {
    const url = new SvelteURL("https://example.com/items?page=1");
    const href = createDerived(() => url.href);
    const page = createDerived(() => url.searchParams.get("page"));

    expect(href.value).toBe("https://example.com/items?page=1");
    expect(page.value).toBe("1");

    url.searchParams.set("page", "2");
    url.searchParams.append("sort", "asc");
    expect(page.value).toBe("2");
    expect(href.value).toBe("https://example.com/items?page=2&sort=asc");

    url.search = "?page=9";
    expect(page.value).toBe("9");
    expect(href.value).toBe("https://example.com/items?page=9");

    const standaloneParams = new SvelteURLSearchParams("b=2&a=1");
    const serialized = createDerived(() => standaloneParams.toString());
    expect(serialized.value).toBe("b=2&a=1");
    standaloneParams.sort();
    expect(serialized.value).toBe("a=1&b=2");
  });

  test("ReactiveValue wraps external state with createSubscriber lifecycle", async () => {
    let current = "idle";
    let notify: (() => void) | undefined;
    let starts = 0;
    let stops = 0;

    const status = new ReactiveValue(
      () => current,
      (update) => {
        starts++;
        notify = update;
        return () => {
          stops++;
        };
      },
    );

    expect(status.current).toBe("idle");
    expect(starts).toBe(0);

    const seen: string[] = [];
    let stop!: () => void;
    createRoot((dispose) => {
      stop = dispose;
      const derived = createDerived(() => `status:${status.current}`);
      createRuneEffect(() => {
        seen.push(derived.value);
      });
    });
    await tick();
    expect(starts).toBe(1);
    expect(seen).toEqual(["status:idle"]);

    current = "active";
    notify?.();
    await tick();
    expect(seen).toEqual(["status:idle", "status:active"]);

    stop();
    await Promise.resolve();
    expect(stops).toBe(1);
  });

  test("svelte/reactivity/window tracks browser metrics and returns undefined on SSR", async () => {
    const prevWindow = (globalThis as Record<string, unknown>).window;
    const prevNavigator = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator",
    );
    const listeners = new Map<string, Set<() => void>>();
    const mediaListeners = new Set<() => void>();
    let rafCallback: FrameRequestCallback | undefined;

    const mockWindow = {
      innerWidth: 1024,
      innerHeight: 768,
      outerWidth: 1100,
      outerHeight: 820,
      screenLeft: 10,
      screenTop: 20,
      scrollX: 0,
      scrollY: 40,
      devicePixelRatio: 1,
      addEventListener(type: string, fn: () => void) {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
      },
      removeEventListener(type: string, fn: () => void) {
        listeners.get(type)?.delete(fn);
      },
      requestAnimationFrame(cb: FrameRequestCallback) {
        rafCallback = cb;
        return 1;
      },
      cancelAnimationFrame() {
        rafCallback = undefined;
      },
      matchMedia() {
        return {
          matches: true,
          addEventListener(_type: string, fn: () => void) {
            mediaListeners.add(fn);
          },
          removeEventListener(_type: string, fn: () => void) {
            mediaListeners.delete(fn);
          },
        };
      },
    };

    (globalThis as Record<string, unknown>).window = mockWindow;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
      writable: true,
    });

    try {
      withSSRRendering(() => {
        expect(reactiveWindow.innerWidth.current).toBeUndefined();
        expect(reactiveWindow.innerHeight.current).toBeUndefined();
        expect(reactiveWindow.outerWidth.current).toBeUndefined();
        expect(reactiveWindow.outerHeight.current).toBeUndefined();
        expect(reactiveWindow.screenLeft.current).toBeUndefined();
        expect(reactiveWindow.screenTop.current).toBeUndefined();
        expect(reactiveWindow.scrollX.current).toBeUndefined();
        expect(reactiveWindow.scrollY.current).toBeUndefined();
        expect(reactiveWindow.online.current).toBeUndefined();
        expect(reactiveWindow.devicePixelRatio.current).toBeUndefined();
      });

      const snapshots: string[] = [];
      let stop!: () => void;
      createRoot((dispose) => {
        stop = dispose;
        createRuneEffect(() => {
          snapshots.push(
            `${reactiveWindow.innerWidth.current}x${reactiveWindow.innerHeight.current}@${reactiveWindow.devicePixelRatio.current}|${reactiveWindow.scrollX.current},${reactiveWindow.scrollY.current}|${reactiveWindow.online.current}|${reactiveWindow.screenLeft.current},${reactiveWindow.screenTop.current}`,
          );
        });
      });

      await tick();
      expect(snapshots.at(-1)).toBe("1024x768@1|0,40|true|10,20");

      mockWindow.innerWidth = 1440;
      mockWindow.innerHeight = 900;
      for (const fn of Array.from(listeners.get("resize") ?? [])) fn();
      await tick();
      expect(snapshots.at(-1)).toBe("1440x900@1|0,40|true|10,20");

      mockWindow.devicePixelRatio = 2;
      for (const fn of Array.from(mediaListeners)) fn();
      await tick();
      expect(snapshots.at(-1)).toBe("1440x900@2|0,40|true|10,20");

      mockWindow.scrollX = 12;
      mockWindow.scrollY = 120;
      for (const fn of Array.from(listeners.get("scroll") ?? [])) fn();
      await tick();
      expect(snapshots.at(-1)).toBe("1440x900@2|12,120|true|10,20");

      Object.defineProperty(globalThis, "navigator", {
        value: { onLine: false },
        configurable: true,
        writable: true,
      });
      for (const fn of Array.from(listeners.get("offline") ?? [])) fn();
      await tick();
      expect(snapshots.at(-1)).toBe("1440x900@2|12,120|false|10,20");

      mockWindow.screenLeft = 50;
      mockWindow.screenTop = 60;
      rafCallback?.(16);
      await tick();
      expect(snapshots.at(-1)).toBe("1440x900@2|12,120|false|50,60");

      stop();
      await Promise.resolve();
      expect(listeners.get("resize")?.size ?? 0).toBe(0);
      expect(listeners.get("scroll")?.size ?? 0).toBe(0);
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
      if (prevNavigator) {
        Object.defineProperty(globalThis, "navigator", prevNavigator);
      }
    }
  });

  test("getAbortSignal aborts on effect rerun/disposal and derived recomputation, and throws outside reactions", async () => {
    expect(() => getAbortSignal()).toThrow(
      /getAbortSignal\(\) can only be called inside an effect or derived/,
    );

    const step = createState(1);
    const effectSignals: AbortSignal[] = [];
    const preSignals: AbortSignal[] = [];

    let stop!: () => void;
    createRoot((dispose) => {
      stop = dispose;
      withRuneScheduler(() => {
        createRunePreEffect(() => {
          void step.value;
          const sig = getAbortSignal();
          expect(sig.aborted).toBe(false);
          preSignals.push(sig);
        });
        createRuneEffect(() => {
          void step.value;
          const sig = getAbortSignal();
          expect(sig.aborted).toBe(false);
          effectSignals.push(sig);
          return () => {
            expect(sig.aborted).toBe(true);
            expect(() => getAbortSignal()).toThrow();
          };
        });
      });
    });

    await tick();
    expect(preSignals.length).toBe(1);
    expect(effectSignals.length).toBe(1);
    expect(preSignals[0]!.aborted).toBe(false);
    expect(effectSignals[0]!.aborted).toBe(false);

    step.value = 2;
    await tick();
    expect(preSignals.length).toBe(2);
    expect(effectSignals.length).toBe(2);
    expect(preSignals[0]!.aborted).toBe(true);
    expect(effectSignals[0]!.aborted).toBe(true);
    expect(preSignals[1]!.aborted).toBe(false);
    expect(effectSignals[1]!.aborted).toBe(false);

    stop();
    expect(preSignals[1]!.aborted).toBe(true);
    expect(effectSignals[1]!.aborted).toBe(true);

    const derivedSignals: AbortSignal[] = [];
    const query = createState("a");
    const derived = createDerived(() => {
      const q = query.value;
      const sig = getAbortSignal();
      derivedSignals.push(sig);
      return `${q}:${sig.aborted}`;
    });
    expect(derived.value).toBe("a:false");
    expect(derivedSignals[0]!.aborted).toBe(false);

    query.value = "b";
    expect(derived.value).toBe("b:false");
    expect(derivedSignals[0]!.aborted).toBe(true);
    expect(derivedSignals[1]!.aborted).toBe(false);

    const ssrDerived = createServerDerived(() => {
      const sig = getServerAbortSignal();
      return sig.aborted;
    });
    expect(ssrDerived.value).toBe(false);
  });

  const compiler = process.env.MOONSHINE_CREPUS_COMPILER;
  test.skipIf(!compiler)(
    "compiles and renders SFCs importing from svelte/reactivity, svelte/reactivity/window, and getAbortSignal",
    async () => {
      const root = join(import.meta.dir, "..");
      const dir = await mkdtemp(
        join(tmpdir(), "moonshine-svelte-reactivity-sfc-"),
      );
      try {
        for (const [name, source] of [
          ["moonshine", join(root, "../core")],
          ["moonshine-dom", join(root, "../dom")],
          ["moonshine-svelte", root],
        ]) {
          const target = join(dir, "node_modules/@tschk", name!);
          await cp(join(source!, "src"), join(target, "src"), {
            recursive: true,
          });
          await cp(join(source!, "package.json"), join(target, "package.json"));
        }

        const sfc = `<script lang="ts">
import { getAbortSignal } from 'svelte';
import { SvelteMap, SvelteSet, SvelteURL, MediaQuery, ReactiveValue } from 'svelte/reactivity';
import { innerWidth } from 'svelte/reactivity/window';
const map = new SvelteMap<string, number>([['count', 2]]);
const set = new SvelteSet<string>(['ok']);
const url = new SvelteURL('https://example.com/?tab=home');
const mq = new MediaQuery('min-width: 768px', true);
const custom = new ReactiveValue(() => 'rv', () => {});
const aborted = $derived(getAbortSignal().aborted);
</script>
<p>{map.get('count')}:{set.has('ok')}:{url.searchParams.get('tab')}:{mq.current}:{custom.current}:{String(innerWidth.current)}:{aborted}</p>`;

        await Bun.write(join(dir, "source/App.svelte"), sfc);

        for (const [emit, outDir] of [
          ["moonshine-dom", "dom"],
          ["moonshine-ssr", "ssr"],
        ] as const) {
          const proc = Bun.spawn(
            [
              compiler!,
              "web",
              "build",
              "--site",
              "source",
              "--entry",
              "App.svelte",
              "--emit",
              emit,
              "--out-dir",
              outDir,
            ],
            { cwd: dir, stdout: "pipe", stderr: "pipe" },
          );
          const [out, err, code] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
          ]);
          expect(code, out + err).toBe(0);
        }

        const verifyScript = `
import assert from 'node:assert/strict';
import AppSSR from './ssr/CrepusEmit.moonshine-ssr.ts';
import { h, renderToString } from '@tschk/moonshine-dom/ssr';
assert.equal(renderToString(() => h(AppSSR, {})), '<p>2:true:home:true:rv:undefined:false</p>');
`;
        const child = Bun.spawn(
          [Bun.which("bun")!, "--no-install", "-e", verifyScript],
          { cwd: dir, stdout: "pipe", stderr: "pipe" },
        );
        const [out, err, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(code, out + err).toBe(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
