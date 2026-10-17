import { expect, test } from "bun:test";
import {
  createRoot,
  getOwner,
  runWithOwner,
} from "@tschk/moonshine-dom/reactive";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import { ref, watchSyncEffect } from "../src/reactive";

test("sync effects track conditional dependencies and keep cleanup reads untracked", () => {
  const branch = ref(true),
    left = ref(1),
    right = ref(2),
    incidental = ref(0);
  const seen: number[] = [],
    cleaned: number[] = [];
  const stop = watchSyncEffect((clean) => {
    seen.push(branch.value ? left.value : right.value);
    clean(() => {
      cleaned.push(incidental.value);
    });
  });
  left.value = 3;
  branch.value = false;
  left.value = 4;
  incidental.value = 10;
  right.value = 5;
  stop();
  stop();
  right.value = 6;
  expect(seen).toEqual([1, 3, 2, 5]);
  expect(cleaned).toEqual([0, 0, 10, 10]);
});

test("late cleanup registration runs at invalidation; registration after stop is inert", () => {
  const value = ref(0),
    trace: unknown[] = [];
  let register!: (fn: () => void) => void;
  const stop = watchSyncEffect((clean) => {
    trace.push(value.value);
    register = clean;
  });
  register(() => trace.push("late"));
  value.value = 1;
  stop();
  register(() => trace.push("after stop"));
  value.value = 2;
  expect(trace).toEqual([0, "late", 1]);
});

test("self writes do not recursively rerun and literal functions remain values", () => {
  const value = ref(0),
    literal = ref(() => "first"),
    seen: unknown[] = [];
  const stop = watchSyncEffect(() => {
    seen.push([value.value, literal.value]);
    if (value.value < 2) value.value++;
  });
  expect(seen).toHaveLength(1);
  const replacement = () => String(value.value);
  literal.value = replacement;
  expect(seen).toHaveLength(2);
  expect(seen[1]).toEqual([1, replacement]);
  value.value = 3;
  expect(seen).toHaveLength(3);
  expect(seen[2]).toEqual([3, replacement]);
  stop();
});

test("owner disposal stops effects, detached effects are manually stoppable", () => {
  const value = ref(0),
    seen: number[] = [];
  let disposed!: ReturnType<typeof getOwner>;
  const end = createRoot((stop) => {
    disposed = getOwner();
    watchSyncEffect(() => {
      seen.push(value.value);
    });
    return stop;
  });
  value.value = 1;
  end();
  value.value = 2;
  expect(seen).toEqual([0, 1]);
  expect(() =>
    runWithOwner(disposed!, () => watchSyncEffect(() => {})),
  ).toThrow("disposed native owner");
});

test("initial errors dispose registered work and preserve the effect error", () => {
  const failure = Error("effect"),
    trace: string[] = [];
  expect(() =>
    watchSyncEffect((clean) => {
      clean(() => {
        trace.push("first");
        throw Error("cleanup");
      });
      clean(() => {
        trace.push("second");
      });
      throw failure;
    }),
  ).toThrow(failure);
  expect(trace).toEqual(["first", "second"]);
});

test("cleanup failures drain peers, propagate first error and do not restart a stopped effect", () => {
  const failure = Error("cleanup"),
    trace: string[] = [];
  const stop = watchSyncEffect((clean) => {
    clean(() => {
      trace.push("first");
      throw failure;
    });
    clean(() => {
      trace.push("second");
    });
  });
  expect(stop).toThrow(failure);
  expect(trace).toEqual(["first", "second"]);
  expect(stop).not.toThrow();
});

test("stopping within a rerun drains cleanup once and ignores later registrations", () => {
  const value = ref(0),
    trace: unknown[] = [];
  const stop = watchSyncEffect((clean) => {
    trace.push(value.value);
    clean(() => trace.push("cleanup"));
    if (value.value) {
      stop();
      clean(() => trace.push("late"));
    }
  });
  value.value = 1;
  value.value = 2;
  expect(trace).toEqual([0, "cleanup", 1, "cleanup"]);
});

test("SSR sync effects stay live until request disposal and isolate requests", () => {
  const trace: number[] = [];
  function Component() {
    const value = ref(1);
    watchSyncEffect((clean) => {
      trace.push(value.value);
      clean(() => trace.push(-value.value));
    });
    value.value = 2;
    return h("p", null, value.value);
  }
  for (let i = 0; i < 2; i++)
    expect(renderToString(() => h(Component, {}))).toBe("<p>2</p>");
  expect(trace).toEqual([1, -2, 2, -2, 1, -2, 2, -2]);
});

test("effect and cleanup callbacks reject invalid inputs explicitly", () => {
  expect(() => watchSyncEffect(null as never)).toThrow(
    "effect must be a function",
  );
  expect(() => watchSyncEffect((clean) => clean(null as never))).toThrow(
    "cleanup must be a function",
  );
});

test("cleanup writes are observed by the next run without recursive callbacks", () => {
  const value = ref(0),
    other = ref(10),
    trace: unknown[] = [];
  const stop = watchSyncEffect((clean) => {
    const current = value.value;
    trace.push(["run", current, other.value]);
    clean(() => {
      trace.push(["cleanup", current]);
      if (value.value === 2) value.value = 3;
    });
  });
  value.value = 2;
  other.value = 11;
  stop();
  expect(trace).toEqual([
    ["run", 0, 10],
    ["cleanup", 0],
    ["run", 3, 10],
    ["cleanup", 3],
    ["run", 3, 11],
    ["cleanup", 3],
  ]);
});

test("stopping from cleanup prevents the pending effect run", () => {
  const value = ref(0),
    trace: number[] = [];
  const stop = watchSyncEffect((clean) => {
    trace.push(value.value);
    clean(() => stop());
  });
  value.value = 1;
  value.value = 2;
  expect(trace).toEqual([0]);
});

test("rerun failure releases registered cleanup and preserves the effect error", () => {
  const value = ref(0),
    failure = Error("rerun"),
    trace: number[] = [];
  const stop = watchSyncEffect((clean) => {
    const current = value.value;
    clean(() => {
      trace.push(current);
      if (current) throw Error("cleanup");
    });
    if (current === 1) throw failure;
  });
  expect(() => {
    value.value = 1;
  }).toThrow(failure);
  expect(trace).toEqual([0, 1]);
  value.value = 2;
  expect(stop).toThrow("cleanup");
  expect(trace).toEqual([0, 1, 2]);
});
