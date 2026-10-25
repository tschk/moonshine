import { expect, test } from "bun:test";
import "../../react/test/dom";
import { createComponent } from "@tschk/moonshine-dom/component";
import {
  componentRef,
  exposeComponent,
  flushComponentReferences,
} from "@tschk/moonshine-dom/component-instance";
import { h, render } from "@tschk/moonshine-dom/dom";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { bindComponentRef, bindRef, exposeRefs } from "../src/expose";
import { onMounted } from "../src/lifecycle";
import { createCheckedModel, createTextModel } from "../src/model";
import {
  isReactive,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
  type TemplateRef,
} from "../src/reactive";
import { createModelOption, createSelectModel } from "../src/select";
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
  void stopExternalWatch;
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
  void stopFirst;
  let stopSecond = () => {};
  void stopSecond;
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

  const makeChild = (initial: string) => {
    void makeChild;
    return () => {
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

test("useTemplateRef creates a readonly template ref, validates setup context and unique keys, and binds elements, components, and form models", () => {
  expect(() => useTemplateRef("outside")).toThrow(
    "Component context is available only during native component initialization",
  );
  createComponent(
    () => {
      expect(() => useTemplateRef("")).toThrow(
        "Template ref key must be a non-empty string",
      );
      useTemplateRef("dup");
      expect(() => useTemplateRef("dup")).toThrow(
        'useTemplateRef("dup") already exists',
      );
    },
    {},
    "dom",
  );
  const ssrRef = createComponent(
    () => useTemplateRef<HTMLInputElement>("ssr-input"),
    {},
    "ssr",
  );
  expect(ssrRef.value).toBeNull();
  expect(() => {
    (ssrRef as unknown as { value: unknown }).value = null;
  }).toThrow("Native ref is readonly");

  const container = document.createElement("main");
  document.body.append(container);
  let textInputRef!: TemplateRef<HTMLInputElement>;
  let checkInputRef!: TemplateRef<HTMLInputElement>;
  let selectRef!: TemplateRef<HTMLSelectElement>;
  let optionRef!: TemplateRef<HTMLOptionElement>;
  let childRef!: TemplateRef<{ label: string }>;
  let exposedParent!: {
    textInputRef: HTMLInputElement | null;
    childRef: { label: string } | null;
  };
  const mountedSnapshot: Array<
    [string | undefined, boolean, string | undefined, string | undefined]
  > = [];

  const dispose = render(
    () =>
      h(() => {
        const text = ref("initial");
        const checked = ref(true);
        const choice = ref("b");
        textInputRef = useTemplateRef<HTMLInputElement>("my-text");
        checkInputRef = useTemplateRef<HTMLInputElement>("my-check");
        selectRef = useTemplateRef<HTMLSelectElement>("my-select");
        optionRef = useTemplateRef<HTMLOptionElement>("my-option");
        childRef = useTemplateRef<{ label: string }>("my-child");

        expect(() => {
          (textInputRef as unknown as { value: unknown }).value = null;
        }).toThrow("Native ref is readonly");

        exposedParent = exposeComponent(exposeRefs({ textInputRef, childRef }));

        onMounted(() => {
          mountedSnapshot.push([
            textInputRef.value?.value,
            checkInputRef.value?.checked ?? false,
            selectRef.value?.value,
            childRef.value?.label,
          ]);
        });

        return h(
          "div",
          null,
          createTextModel(
            "input",
            {
              ref: (el: HTMLInputElement) => bindRef(el, textInputRef),
            },
            () => text.value,
            (next) => {
              text.value = String(next);
            },
          ),
          createCheckedModel(
            "checkbox",
            {
              ref: (el: HTMLInputElement) => bindRef(el, checkInputRef),
            },
            () => checked.value,
            (next) => {
              checked.value = Boolean(next);
            },
          ),
          createSelectModel(
            {
              ref: (el: HTMLSelectElement) => bindRef(el, selectRef),
            },
            () => choice.value,
            (next) => {
              choice.value = String(next);
            },
            [
              createModelOption({ value: "a" }, "A"),
              createModelOption(
                {
                  value: "b",
                  ref: (el: HTMLOptionElement) => bindRef(el, optionRef),
                },
                "B",
              ),
            ],
          ),
          h(
            () => {
              const label = ref("child-ok");
              exposeComponent(exposeRefs({ label }));
              return h("span", null, () => label.value);
            },
            {
              [componentRef]: bindComponentRef(childRef),
            },
          ),
        );
      }, {}),
    container,
  );

  expect(mountedSnapshot).toEqual([["initial", true, "b", "child-ok"]]);
  expect(textInputRef.value).toBe(container.querySelector("input"));
  expect(checkInputRef.value?.type).toBe("checkbox");
  expect(selectRef.value).toBe(container.querySelector("select"));
  expect(optionRef.value?.selected).toBe(true);
  expect(childRef.value?.label).toBe("child-ok");
  expect(exposedParent.textInputRef).toBe(textInputRef.value);
  expect(exposedParent.childRef?.label).toBe("child-ok");
  expect(() => {
    exposedParent.textInputRef = null;
  }).toThrow("Native ref is readonly");

  dispose();
  expect(textInputRef.value).toBeNull();
  expect(checkInputRef.value).toBeNull();
  expect(selectRef.value).toBeNull();
  expect(optionRef.value).toBeNull();
  expect(childRef.value).toBeNull();
  container.remove();
});
