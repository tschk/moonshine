import { expect, test } from "bun:test";
import "../../react/test/dom";
import {
  componentRef,
  exposeComponent,
  flushComponentReferences,
} from "@tschk/moonshine-dom/component-instance";
import { h, render } from "@tschk/moonshine-dom/dom";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { bindRef, exposeRefs } from "../src/expose";
import { onMounted } from "../src/lifecycle";
import { isReactive, ref, shallowRef, watch } from "../src/reactive";
import { createDOMSlotOutlet, withDefaultSlot } from "../src/slots";

test("element and component template refs publish before onMounted, preserve identity in ref(), and clear synchronously on commit", () => {
  const container = document.createElement("main");
  document.body.append(container);
  const trace: Array<[string, boolean, number | undefined]> = [];
  const inputEl = ref<HTMLInputElement | null>(null);
  const slotSpan = ref<HTMLSpanElement | null>(null);
  const childVm = ref<{ count: number; increment: () => void } | null>(null);
  const internalWatched: Array<HTMLInputElement | null> = [];
  const externalWatched: Array<HTMLInputElement | null> = [];
  let stopExternalWatch = () => {};
  createRoot((stop) => {
    stopExternalWatch = stop;
    watch(
      inputEl,
      (value) => {
        externalWatched.push(value);
      },
      { flush: "sync" },
    );
  });
  let exposedChildInstance: object | undefined;

  const Child = (props: Record<PropertyKey, unknown>) => {
    const count = ref(7);
    const outlet = createDOMSlotOutlet(props);
    exposedChildInstance = exposeComponent(
      exposeRefs({
        count,
        increment() {
          count.value++;
        },
      }),
    );
    onMounted(() => {
      trace.push([
        "child:mounted",
        inputEl.value instanceof HTMLInputElement,
        childVm.value?.count,
      ]);
    });
    return h("section", null, () => outlet(() => h("em", null, "fallback")));
  };

  const dispose = render(
    () =>
      h(() => {
        watch(
          inputEl,
          (value) => {
            internalWatched.push(value);
          },
          { flush: "sync" },
        );
        onMounted(() => {
          trace.push([
            "parent:mounted",
            slotSpan.value instanceof HTMLSpanElement,
            childVm.value?.count,
          ]);
        });
        return h(
          "div",
          null,
          h("input", {
            ref: (el: HTMLInputElement) =>
              bindRef(el, {
                get: () => inputEl.value,
                set: (next) => {
                  inputEl.value = next;
                },
              }),
          }),
          h(
            withDefaultSlot(Child, () =>
              h(
                "span",
                {
                  ref: (el: HTMLSpanElement) =>
                    bindRef(el, {
                      get: () => slotSpan.value,
                      set: (next) => {
                        slotSpan.value = next;
                      },
                    }),
                },
                "slotted",
              ),
            ),
            {
              [componentRef]: {
                cleanup: "commit" as const,
                get: () => childVm.value,
                set: (
                  next: { count: number; increment: () => void } | null,
                ) => {
                  childVm.value = next;
                },
              },
            },
          ),
        );
      }, {}),
    container,
  );

  const domInput = container.querySelector("input")!;
  const domSpan = container.querySelector("span")!;
  expect(inputEl.value).toBe(domInput);
  expect(slotSpan.value).toBe(domSpan);
  expect(childVm.value).toBe(exposedChildInstance as never);
  expect(trace).toEqual([
    ["child:mounted", true, 7],
    ["parent:mounted", true, 7],
  ]);
  childVm.value!.increment();
  expect(childVm.value!.count).toBe(8);

  dispose();
  expect(inputEl.value).toBeNull();
  expect(slotSpan.value).toBeNull();
  expect(childVm.value).toBeNull();
  expect(internalWatched).toEqual([domInput]);
  expect(externalWatched).toEqual([domInput, null]);
  stopExternalWatch();
  container.remove();
});

test("owner disposed before flush skips publication and identity guard preserves replacement", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  const target = shallowRef<HTMLDivElement | null>(null);
  let writes = 0;

  createRoot((stop) => {
    bindRef(first, {
      get: () => target.value,
      set: (next) => {
        writes++;
        target.value = next;
      },
    });
    stop();
  });
  flushComponentReferences();
  expect(writes).toBe(0);
  expect(target.value).toBeNull();

  let stopFirst = () => {};
  let stopSecond = () => {};
  createRoot((stop) => {
    stopFirst = stop;
    bindRef(first, {
      get: () => target.value,
      set: (next) => {
        target.value = next;
      },
    });
  });
  flushComponentReferences();
  expect(target.value).toBe(first);

  createRoot((stop) => {
    stopSecond = stop;
    bindRef(second, {
      get: () => target.value,
      set: (next) => {
        target.value = next;
      },
    });
  });
  flushComponentReferences();
  expect(target.value).toBe(second);

  // Disposing the first owner does not clear the second owner's element.
  stopFirst();
  expect(target.value).toBe(second);

  stopSecond();
  expect(target.value).toBeNull();
});

test("separate component instances keep isolated template refs and ref(instance) preserves null-proto exposed identity", () => {
  const hostA = document.createElement("div");
  const hostB = document.createElement("div");
  document.body.append(hostA, hostB);

  const refsA = {
    el: ref<HTMLButtonElement | null>(null),
    child: ref<{ label: string; bump: () => void } | null>(null),
  };
  const refsB = {
    el: ref<HTMLButtonElement | null>(null),
    child: ref<{ label: string; bump: () => void } | null>(null),
  };

  const makeChild = (initial: string) => () => {
    const label = ref(initial);
    const exposed = exposeComponent(
      exposeRefs({
        label,
        bump() {
          label.value += "!";
        },
      }),
    );
    expect(Object.getPrototypeOf(Object.getPrototypeOf(exposed))).toBeNull();
    return h("span", null, () => label.value);
  };

  const ChildA = makeChild("alpha");
  const ChildB = makeChild("beta");

  const disposeA = render(
    () =>
      h(
        "section",
        null,
        h(
          "button",
          {
            ref: (el: HTMLButtonElement) =>
              bindRef(el, {
                get: () => refsA.el.value,
                set: (next) => {
                  refsA.el.value = next;
                },
              }),
          },
          "A",
        ),
        h(ChildA, {
          [componentRef]: {
            cleanup: "commit" as const,
            get: () => refsA.child.value,
            set: (next: { label: string; bump: () => void } | null) => {
              refsA.child.value = next;
            },
          },
        }),
      ),
    hostA,
  );

  const disposeB = render(
    () =>
      h(
        "section",
        null,
        h(
          "button",
          {
            ref: (el: HTMLButtonElement) =>
              bindRef(el, {
                get: () => refsB.el.value,
                set: (next) => {
                  refsB.el.value = next;
                },
              }),
          },
          "B",
        ),
        h(ChildB, {
          [componentRef]: {
            cleanup: "commit" as const,
            get: () => refsB.child.value,
            set: (next: { label: string; bump: () => void } | null) => {
              refsB.child.value = next;
            },
          },
        }),
      ),
    hostB,
  );

  flushComponentReferences();
  expect(refsA.el.value).toBe(hostA.querySelector("button"));
  expect(refsB.el.value).toBe(hostB.querySelector("button"));
  expect(refsA.el.value).not.toBe(refsB.el.value);
  expect(refsA.child.value?.label).toBe("alpha");
  expect(refsB.child.value?.label).toBe("beta");
  expect(isReactive(refsA.child.value)).toBe(false);
  expect(
    Object.getPrototypeOf(Object.getPrototypeOf(refsA.child.value)),
  ).toBeNull();

  refsA.child.value!.bump();
  expect(refsA.child.value?.label).toBe("alpha!");
  expect(refsB.child.value?.label).toBe("beta");

  disposeA();
  expect(refsA.el.value).toBeNull();
  expect(refsA.child.value).toBeNull();
  expect(refsB.el.value).toBe(hostB.querySelector("button"));
  expect(refsB.child.value?.label).toBe("beta");

  disposeB();
  expect(refsB.el.value).toBeNull();
  expect(refsB.child.value).toBeNull();
  hostA.remove();
  hostB.remove();
});
