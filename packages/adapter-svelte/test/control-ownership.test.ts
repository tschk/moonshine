import { test, expect } from "bun:test";
import {
  createRoot,
  createSignal,
  createRenderEffect,
  getOwner,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import {
  Show,
  Switch,
  Match,
  mapArray,
  indexArray,
} from "@tschk/moonshine-dom/control";
import { createComponent } from "@tschk/moonshine-dom/component";
import { renderToString, h } from "@tschk/moonshine-dom/ssr";
import { withRuneScheduler } from "../src/pre";
import { onDestroy } from "../src/svelte";
for (const kind of ["show", "switch", "map", "index"])
  test(
    "scheduled " + kind + " child teardown precedes parent registered first",
    () => {
      const trace: string[] = [];
      const child = () =>
        createComponent(
          () => {
            onDestroy(() => trace.push("child"));
            return 1;
          },
          {},
          "dom",
        );
      createRoot((stop) => {
        withRuneScheduler(() =>
          createComponent(
            () => {
              onDestroy(() => trace.push("parent"));
              if (kind === "show") Show({ when: () => true, children: child });
              if (kind === "switch")
                Switch({
                  children: () => [
                    Match({ when: () => true, children: child }),
                  ],
                });
              if (kind === "map") mapArray(() => [1], child);
              if (kind === "index") indexArray(() => [1], child);
            },
            {},
            "dom",
          ),
        );
        stop();
        stop();
      });
      expect(trace).toEqual(["child", "parent"]);
    },
  );
test("scheduled retained rows survive each structural rerun and dispose once", async () => {
  const a = {},
    b = {};
  const [list, set] = createSignal([a, b]);
  const trace: string[] = [],
    roots: any[] = [];
  let rows!: () => any[], stop!: () => void;
  let count = 0;
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => {
      rows = mapArray(list, () => {
        const id = ++count;
        roots.push(getOwner());
        onCleanup(() => trace.push("clean:" + id));
        return { id };
      });
      createRenderEffect(() => rows());
    });
  });
  const original = rows();
  set([b, a]);
  await Promise.resolve();
  expect(rows()).toEqual([original[1], original[0]]);
  expect(trace).toEqual([]);
  set([a]);
  await Promise.resolve();
  expect(trace).toEqual(["clean:2"]);
  stop();
  expect(trace).toEqual(["clean:2", "clean:1"]);
  expect(roots.every((owner) => owner.disposed)).toBe(true);
});
test("scheduled cancellation during mapper setup does not attach orphan roots", () => {
  let owner: any;
  const trace: string[] = [];
  createRoot((stop) => {
    owner = getOwner();
    withRuneScheduler(() =>
      mapArray(
        () => [1, 2],
        (item) => {
          onCleanup(() => trace.push("row:" + item));
          stop();
          return item;
        },
      ),
    );
  });
  expect(trace).toEqual(["row:1"]);
  expect(owner.children.size).toBe(0);
});
test("default and SSR controls preserve prior detached teardown contract", () => {
  for (const ssr of [false, true]) {
    const trace: string[] = [];
    const Parent = () => {
      onDestroy(() => trace.push("parent"));
      const branch = () =>
        Show({
          when: () => true,
          children: () =>
            createComponent(
              () => {
                onDestroy(() => trace.push("child"));
                return "child";
              },
              {},
              ssr ? "ssr" : "dom",
            ),
        });
      return ssr ? withRuneScheduler(branch) : branch();
    };
    if (ssr) expect(renderToString(() => h(Parent, {}))).toBe("child");
    else
      createRoot((stop) => {
        createComponent(Parent, {}, "dom");
        stop();
      });
    expect(trace).toEqual(["parent", "child"]);
  }
});

test("scheduled failed mapping drains newly attached rows and preserves mapper error", () => {
  const failure = Error("mapper"),
    trace: number[] = [];
  expect(() =>
    createRoot(() =>
      withRuneScheduler(() =>
        mapArray(
          () => [1, 2],
          (item) => {
            onCleanup(() => {
              trace.push(item);
              throw Error("cleanup");
            });
            if (item === 2) throw failure;
            return item;
          },
        ),
      ),
    ),
  ).toThrow(failure);
  expect(trace).toEqual([2, 1]);
});

test("nested scheduled retained rows survive outer reorder and dispose child first", async () => {
  const a = {},
    b = {},
    [list, set] = createSignal([a, b]);
  let stop!: () => void, rows!: () => any[];
  let setups = 0;
  const trace: string[] = [];
  createRoot((dispose) => {
    stop = dispose;
    withRuneScheduler(() => {
      rows = mapArray(list, () => {
        const id = ++setups;
        onCleanup(() => trace.push("outer:" + id));
        return mapArray(
          () => [1],
          () => {
            onCleanup(() => trace.push("inner:" + id));
            return id;
          },
        );
      });
      createRenderEffect(() => rows().map((read) => read()));
    });
  });
  set([b, a]);
  await Promise.resolve();
  expect(setups).toBe(2);
  expect(rows().map((read) => read())).toEqual([[2], [1]]);
  expect(trace).toEqual([]);
  stop();
  // Svelte destroys retained keyed rows in their current order, child first.
  expect(trace).toEqual(["inner:2", "outer:2", "inner:1", "outer:1"]);
});
