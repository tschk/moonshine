import { expect, test } from "bun:test";
import "../../react/test/dom";
import { createComponent } from "@tschk/moonshine-dom/component";
import { exposeComponent } from "@tschk/moonshine-dom/component-instance";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { exposeRefs } from "../src/expose";
import { computed, ref } from "../src/reactive";

test("exposeRefs unwraps refs on get, writes through refs on set, and freezes key set at call time", () => {
  const count = ref(1);
  const doubled = computed(() => count.value * 2);
  const source: Record<string, unknown> = {
    count,
    doubled,
    plain: "initial",
    increment() {
      count.value++;
    },
  };
  Object.defineProperty(source, "hidden", {
    value: "secret",
    enumerable: false,
  });
  Object.defineProperty(source, "__proto__", {
    value: ref("safe"),
    enumerable: true,
    writable: true,
    configurable: true,
  });

  const exposed = exposeRefs(source) as {
    count: number;
    doubled: number;
    plain: string;
    increment: () => void;
    __proto__: string;
    later?: number;
  };
  source.later = 99;

  expect(Object.getPrototypeOf(exposed)).toBeNull();
  expect(Object.keys(exposed)).toEqual([
    "count",
    "doubled",
    "plain",
    "increment",
    "__proto__",
  ]);
  expect(exposed.count).toBe(1);
  expect(exposed.doubled).toBe(2);
  expect(exposed.plain).toBe("initial");
  expect(exposed.__proto__).toBe("safe");
  expect("hidden" in exposed).toBe(false);
  expect("later" in exposed).toBe(false);

  // Writing a non-ref value writes through the underlying ref.
  exposed.count = 5;
  expect(count.value).toBe(5);
  expect(exposed.doubled).toBe(10);

  // Writing a plain property replaces it on source.
  exposed.plain = "updated";
  expect(source.plain).toBe("updated");
  expect(exposed.plain).toBe("updated");

  // Writing a new ref replaces the ref on source.
  const replacement = ref(20);
  (exposed as unknown as { count: unknown }).count = replacement;
  expect(source.count).toBe(replacement);
  expect(exposed.count).toBe(20);

  // Readonly computed ref throws on set.
  expect(() => {
    (exposed as { doubled: number }).doubled = 12;
  }).toThrow("readonly");
});

test("exposeRefs result is accepted by exposeComponent and rejects non-plain sources", () => {
  const count = ref(10);
  createRoot((stop) => {
    const instance = createComponent(
      () =>
        exposeComponent(
          exposeRefs({
            count,
            bump() {
              count.value += 5;
            },
          }),
        ),
      {},
      "dom",
    );
    expect(instance.count).toBe(10);
    instance.bump();
    expect(instance.count).toBe(15);
    stop();
  });

  for (const invalid of [null, undefined, [1], new Date(), () => 1]) {
    expect(() => exposeRefs(invalid as never)).toThrow("plain object");
  }
});
