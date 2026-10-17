import { test, expect } from "bun:test";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { ref, watch } from "@tschk/moonshine-vue/reactive";
import { withComponentErrorHandler } from "@tschk/moonshine-vue/errors";
test("configured getter source feedback skips nested evaluation and recovers previous bookkeeping", () => {
  const a = ref(0),
    trace: unknown[] = [];
  createRoot((stop) => {
    withComponentErrorHandler(
      (_error) => {
        trace.push("handler");
        a.value = 2;
      },
      () =>
        watch(
          () => {
            const n = a.value;
            trace.push(["get", n]);
            if (n === 1) throw Error("getter");
            return n;
          },
          (n, p) => trace.push(["callback", n, p]),
          { flush: "sync" },
        ),
    );
    a.value = 1;
    expect(trace).toEqual([
      ["get", 0],
      ["get", 1],
      "handler",
      ["callback", undefined, 0],
    ]);
    a.value = 3;
    expect(trace.at(-1)).toEqual(["callback", 3, undefined]);
    stop();
  });
});
test("no-policy getter remains reentrant and callback feedback remains reentrant", () => {
  const a = ref(0),
    b = ref(0),
    trace: unknown[] = [];
  createRoot((stop) => {
    watch(
      () => {
        const n = a.value;
        trace.push(["get", n]);
        if (n === 1) a.value = 2;
        return n;
      },
      (n) => trace.push(["callback", n]),
      { flush: "sync" },
    );
    withComponentErrorHandler(
      () => {
        if (b.value === 1) b.value = 2;
      },
      () =>
        watch(
          b,
          (n) => {
            trace.push(["b", n]);
            if (n < 3) throw Error("callback");
          },
          { flush: "sync" },
        ),
    );
    a.value = 1;
    b.value = 1;
    expect(trace).toEqual([
      ["get", 0],
      ["get", 1],
      ["get", 2],
      ["callback", 2],
      ["callback", 1],
      ["b", 1],
      ["b", 2],
    ]);
    stop();
  });
});
test("branch switches retain new dependencies after skipped nested evaluation", () => {
  const a = ref(0),
    b = ref(10),
    choose = ref(true),
    trace: unknown[] = [];
  createRoot((stop) => {
    withComponentErrorHandler(
      () => {
        a.value = 2;
        choose.value = false;
      },
      () =>
        watch(
          () => {
            const n = choose.value ? a.value : b.value;
            trace.push(["get", n]);
            if (n === 1) throw Error("getter");
            return n;
          },
          (n, p) => trace.push(["callback", n, p]),
          { flush: "sync" },
        ),
    );
    a.value = 1;
    a.value = 3;
    b.value = 30;
    a.value = 4;
    expect(trace).toEqual([
      ["get", 0],
      ["get", 1],
      ["callback", undefined, 0],
      ["get", 10],
      ["callback", 10, undefined],
      ["get", 30],
      ["callback", 30, 10],
    ]);
    stop();
    b.value = 40;
    expect(trace).toHaveLength(7);
  });
});
test("multi-source finishes all outer reads and records new values with correct previous array", () => {
  const a = ref(0),
    b = ref(10),
    trace: unknown[] = [];
  createRoot((stop) => {
    withComponentErrorHandler(
      () => {
        a.value = 2;
        b.value = 20;
      },
      () =>
        watch(
          [
            () => {
              const n = a.value;
              trace.push(["a", n]);
              if (n === 1) throw Error("getter");
              return n;
            },
            () => {
              trace.push(["b", b.value]);
              return b.value;
            },
          ],
          (n, p) => trace.push(["callback", n, p]),
          { flush: "sync" },
        ),
    );
    a.value = 1;
    a.value = 3;
    b.value = 30;
    expect(trace).toEqual([
      ["a", 0],
      ["b", 10],
      ["a", 1],
      ["b", 20],
      ["callback", [undefined, 20], [0, 10]],
      ["a", 3],
      ["b", 20],
      ["callback", [3, 20], [undefined, 20]],
      ["a", 3],
      ["b", 30],
      ["callback", [3, 30], [3, 20]],
    ]);
    stop();
  });
});
test("dispose during getter reporting drains cleanup once and cannot resume stopped callback", () => {
  const a = ref(0),
    trace: unknown[] = [];
  let stop!: () => void;
  createRoot((d) => {
    stop = d;
    withComponentErrorHandler(
      () => stop(),
      () =>
        watch(
          () => {
            const n = a.value;
            if (n === 1) throw Error("getter");
            return n;
          },
          (n, _, cleanup) => {
            trace.push(["callback", n]);
            cleanup(() => trace.push("cleanup"));
          },
          { flush: "sync", immediate: true },
        ),
    );
  });
  a.value = 1;
  a.value = 3;
  expect(trace).toEqual([["callback", 0], "cleanup"]);
});
test("throwing getter-return catch method restores guard and retains previous value", () => {
  const a = ref(0),
    trace: unknown[] = [];
  createRoot((stop) => {
    withComponentErrorHandler(
      () => trace.push("reported"),
      () =>
        watch(
          () => {
            const n = a.value;
            if (n === 1)
              return {
                // oxlint-disable-next-line unicorn/no-thenable -- exercise pinned getter-return inspection failure.
                then() {},
                catch() {
                  throw Error("catch method");
                },
              };
            return n;
          },
          (n, p) => trace.push([n, p]),
          { flush: "sync" },
        ),
    );
    expect(() => {
      a.value = 1;
    }).toThrow("catch method");
    a.value = 3;
    expect(trace).toEqual([[3, 0]]);
    stop();
  });
});
