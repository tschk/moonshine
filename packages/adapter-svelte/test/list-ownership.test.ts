import { expect, test } from "bun:test";
import { mapArray, indexArray } from "@tschk/moonshine-dom/control";
import {
  createRoot,
  createSignal,
  createComponentScope,
  getOwner,
  runWithOwner,
  type Owner,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";
import { withRuneScheduler } from "@tschk/moonshine-svelte/pre";
const tick = async () => {
  await Promise.resolve();
};
test("keyed current row order precedes following sibling during final disposal", async () => {
  const trace: string[] = [];
  let set!: (items: string[]) => void;
  const stop = createRoot((dispose) => {
    withRuneScheduler(() => {
      const [items, write] = createSignal(["a", "b"]);
      set = write;
      const mapped = mapArray(items, (item, index) => {
        onCleanup(() => trace.push(item + index()));
        return item;
      });
      mapped();
      createComponentScope(() => onCleanup(() => trace.push("sibling")));
    });
    return dispose;
  });
  set(["b", "a", "c"]);
  await tick();
  stop();
  expect(trace).toEqual(["b0", "a1", "c2", "sibling"]);
});
test("index rows stay grouped before a following sibling after append", async () => {
  const trace: string[] = [];
  let set!: (items: string[]) => void;
  const stop = createRoot((dispose) => {
    withRuneScheduler(() => {
      const [items, write] = createSignal(["a"]);
      set = write;
      indexArray(items, (item, index) => {
        onCleanup(() => trace.push(item() + index));
        return item();
      })();
      createComponentScope(() => onCleanup(() => trace.push("sibling")));
    });
    return dispose;
  });
  set(["b", "c"]);
  await tick();
  stop();
  expect(trace).toEqual(["b0", "c1", "sibling"]);
});
test("duplicate item roots retain separate identities and current order", async () => {
  const trace: string[] = [];
  let set!: (items: string[]) => void;
  let serial = 0;
  const stop = createRoot((dispose) => {
    withRuneScheduler(() => {
      const [items, write] = createSignal(["a", "a", "b"]);
      set = write;
      mapArray(items, (item, index) => {
        const id = ++serial;
        onCleanup(() => trace.push(item + id + "@" + index()));
        return id;
      })();
    });
    return dispose;
  });
  set(["a", "b", "a"]);
  await tick();
  stop();
  expect(trace).toEqual(["a1@0", "b3@1", "a2@2"]);
});
test("cleanup errors drain reordered peers and preserve the first current row error", async () => {
  const trace: string[] = [];
  let set!: (items: string[]) => void;
  const stop = createRoot((dispose) => {
    withRuneScheduler(() => {
      const [items, write] = createSignal(["a", "b"]);
      set = write;
      mapArray(items, (item) => {
        onCleanup(() => {
          trace.push(item);
          throw Error(item);
        });
        return item;
      })();
      createComponentScope(() => onCleanup(() => trace.push("sibling")));
    });
    return dispose;
  });
  set(["b", "a"]);
  await tick();
  expect(stop).toThrow("b");
  expect(trace).toEqual(["b", "a", "sibling"]);
});
test("deferred removed roots survive reordering until commit or owner disposal", async () => {
  const trace: string[] = [];
  const pending: (() => void)[] = [];
  let set!: (items: string[]) => void;
  const stop = createRoot((dispose) => {
    withRuneScheduler(() => {
      const [items, write] = createSignal(["a"]);
      set = write;
      mapArray(
        items,
        (item) => {
          trace.push("setup:" + item);
          onCleanup(() => trace.push("stop:" + item));
          return item;
        },
        (done) => pending.push(done),
      )();
    });
    return dispose;
  });
  set(["b"]);
  await tick();
  expect(trace).toEqual(["setup:a", "setup:b"]);
  pending.shift()!();
  expect(trace).toEqual(["setup:a", "setup:b", "stop:a"]);
  set(["c"]);
  await tick();
  stop();
  expect(trace.filter((x) => x === "stop:b")).toHaveLength(1);
  expect(trace.filter((x) => x === "stop:c")).toHaveLength(1);
  pending.shift()!();
  expect(trace.filter((x) => x === "stop:b")).toHaveLength(1);
});

test("retained disposed scheduler owners reject lists without attaching a group", () => {
  let captured!: Owner;
  let carrier: Owner["context"];
  const stop = createRoot((dispose) => {
    withRuneScheduler(() => {
      captured = getOwner()!;
      carrier = captured.context;
    });
    return dispose;
  });
  stop();
  expect(captured.children.size).toBe(0);
  // Retained async work may still carry the old scheduler; disposed ownership
  // must reject before even the list's otherwise-empty group can attach.
  captured.context = carrier;
  try {
    runWithOwner(captured, () => {
      expect(() =>
        mapArray(
          () => [],
          () => undefined,
        ),
      ).toThrow("disposed");
      expect(() =>
        indexArray(
          () => [],
          () => undefined,
        ),
      ).toThrow("disposed");
      expect(captured.children.size).toBe(0);
    });
  } finally {
    captured.context = undefined;
  }
});
