import { expect, test } from "bun:test";
import {
  createRoot,
  createComponentScope,
  getOwner,
  getRenderScheduler,
  onCleanup,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";
import {
  renderSchedulerKey,
  type RenderScheduler,
} from "@tschk/moonshine-dom/render-scheduler";
import {
  captureRuneReferenceCleanup,
  markRuneSourceEffect,
  withRuneScheduler,
} from "../src/pre";

test("only a current live Rune carrier can mark source provenance", () => {
  expect(markRuneSourceEffect).toThrow("live current Rune group");
  createRoot((stop) => {
    withRuneScheduler(() => {
      expect(markRuneSourceEffect).not.toThrow();
      const parent = getOwner()!;
      createComponentScope(() => {
        expect(markRuneSourceEffect).toThrow("live current Rune group");
        const owner = getOwner()!;
        owner.context = new Map(owner.context);
        owner.context.set(renderSchedulerKey, {
          effect() {},
        } as unknown as RenderScheduler);
        expect(captureRuneReferenceCleanup).toThrow("source provenance");
      });
      runWithOwner(parent, () =>
        expect(captureRuneReferenceCleanup).not.toThrow(),
      );
    });
    stop();
  });
});

test("source tails drain LIFO, continue after thrown undefined, and stop once", () => {
  const trace: number[] = [];
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => {
      const enqueue = captureRuneReferenceCleanup();
      // Emulate two descendant reference cleanup callbacks under this source.
      const scheduler = getRenderScheduler()!;
      createComponentScope(() =>
        scheduler.branch(() => {
          markRuneSourceEffect();
          onCleanup(() => enqueue(() => trace.push(1)));
          onCleanup(() =>
            enqueue(() => {
              trace.push(2);
              throw undefined;
            }),
          );
          onCleanup(() => enqueue(() => trace.push(3)));
        }),
      );
    });
  });
  let threw = false;
  try {
    stop();
  } catch (error) {
    threw = true;
    expect(error).toBeUndefined();
  }
  expect(threw).toBe(true);
  expect(trace).toEqual([3, 2, 1]);
  stop();
  expect(trace).toEqual([3, 2, 1]);
});

test("a clear outside source disposal retains commit fallback and does not leak", async () => {
  const trace: number[] = [];
  let stop!: () => void;
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => {
      const enqueue = captureRuneReferenceCleanup();
      enqueue(() => trace.push(1));
      expect(trace).toEqual([]);
    });
  });
  await Promise.resolve();
  expect(trace).toEqual([1]);
  stop();
  expect(trace).toEqual([1]);
});

test("root tail captures outer owner while live and survives consumer clearing", () => {
  const trace: string[] = [];
  createRoot((stop) => {
    onCleanup(() => trace.push("outer"));
    withRuneScheduler(() => {
      onCleanup(() => trace.push("inner"));
      const enqueue = captureRuneReferenceCleanup();
      onCleanup(() => enqueue(() => trace.push("clear")));
    });
    stop();
  });
  expect(trace).toEqual(["inner", "outer", "clear"]);
});
