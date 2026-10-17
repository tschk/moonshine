import { test, expect } from "bun:test";
import {
  createRoot,
  createSignal,
  createRenderEffect,
  onCleanup,
  getOwner,
} from "@tschk/moonshine-dom/reactive";
import { createComponent } from "@tschk/moonshine-dom/component";
import { Show } from "@tschk/moonshine-dom/control";
import { withRuneScheduler } from "../src/pre";
import { onDestroy } from "../src/svelte";

test("render reruns replace their owned child scope without accumulating roots", async () => {
  const [n, set] = createSignal(0);
  const trace: number[] = [];
  const scopes: any[] = [];
  let stop!: () => void, parent: any;
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => {
      parent = getOwner();
      createRenderEffect(() => {
        const value = n();
        createComponent(
          () => {
            scopes.push(getOwner());
            onDestroy(() => trace.push(value));
          },
          {},
          "dom",
        );
      });
    });
  });
  const count = parent.children.size;
  set(1);
  await Promise.resolve();
  expect(trace).toEqual([0]);
  expect(scopes[0].disposed).toBe(true);
  expect(parent.children.size).toBe(count);
  set(2);
  await Promise.resolve();
  expect(trace).toEqual([0, 1]);
  expect(parent.children.size).toBe(count);
  stop();
  expect(trace).toEqual([0, 1, 2]);
  expect(scopes.every((scope) => scope.disposed)).toBe(true);
});
for (const kind of ["render", "structural"])
  test(
    kind +
      " owned teardown drains child and parent failures in hierarchy order",
    () => {
      const failure = Error("child"),
        trace: string[] = [];
      let stop!: () => void;
      createRoot((dispose) => {
        stop = dispose;
        withRuneScheduler(() => {
          onDestroy(() => {
            trace.push("parent");
            throw Error("parent");
          });
          const setup = () =>
            createComponent(
              () => {
                onDestroy(() => {
                  trace.push("child");
                  throw failure;
                });
                onCleanup(() => trace.push("peer"));
                return 1;
              },
              {},
              "dom",
            );
          if (kind === "render") createRenderEffect(setup);
          else Show({ when: () => true, children: setup });
        });
      });
      expect(stop).toThrow(failure);
      expect(trace).toEqual(["child", "peer", "parent"]);
      expect(stop).not.toThrow();
    },
  );

test("canceled render setup never reparents a surviving orphan", () => {
  let root: any;
  const scopes: any[] = [];
  createRoot((stop) => {
    root = getOwner();
    withRuneScheduler(() =>
      createRenderEffect(() => {
        scopes.push(getOwner());
        stop();
      }),
    );
  });
  expect(root.children.size).toBe(0);
  expect(scopes.every((scope) => scope.disposed)).toBe(true);
});
