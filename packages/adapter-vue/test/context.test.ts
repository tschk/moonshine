import { expect, test } from "bun:test";
import { createComponent } from "@tschk/moonshine-dom/component";
import {
  createComputed,
  createRoot,
  onCleanup,
  createSignal,
} from "@tschk/moonshine-dom/reactive";
import { h, render } from "@tschk/moonshine-dom/dom";
import { h as serverH, renderToString } from "@tschk/moonshine-dom/ssr";
import { ref, useId as reactiveUseId } from "../src/reactive";
import {
  provide,
  inject,
  hasInjectionContext,
  useId,
  type InjectionKey,
} from "../src/context";
import "../../react/test/dom";

test("injection resolves parents rather than self and shadows only descendants", () => {
  const key: InjectionKey<number> = Symbol("number");
  createRoot((stop) => {
    createComponent(
      () => {
        provide(key, 1);
        provide("value", "outer");
        expect(inject(key)).toBe(undefined);
        createComponent(
          () => {
            expect(inject(key)).toBe(1);
            provide(key, 2);
            expect(inject(key)).toBe(1);
            createComponent(
              () => {
                expect(inject(key)).toBe(2);
                expect(inject<string>("value")).toBe("outer");
              },
              {},
              "dom",
            );
          },
          {},
          "dom",
        );
        createComponent(() => expect(inject(key)).toBe(1), {}, "dom");
      },
      {},
      "dom",
    );
    stop();
  });
});

test("provided undefined is present and default factories are lazy without fake Vue this", () => {
  let calls = 0;
  const fn = () => ++calls;
  createRoot((stop) => {
    createComponent(
      () => {
        provide<number | undefined>("undefined", undefined);
        createComponent(
          () => {
            expect(inject<number | undefined>("undefined", fn, true)).toBe(
              undefined,
            );
            expect(inject("missing", fn)).toBe(fn);
            expect(inject("missing", fn, true)).toBe(1);
            expect(
              inject(
                "missing",
                function (this: unknown) {
                  expect(this).toBe(undefined);
                  return 2;
                },
                true,
              ),
            ).toBe(2);
          },
          {},
          "dom",
        );
      },
      {},
      "dom",
    );
    expect(calls).toBe(1);
    stop();
  });
});

test("DOM consumers retain reactive refs and dispose owned work", () => {
  const container = document.createElement("main");
  const value = ref(1);
  let cleanups = 0;
  function Child() {
    const injected = inject<typeof value>("count")!;
    expect(injected).toBe(value);
    onCleanup(() => cleanups++);
    return h("p", null, () => injected.value);
  }
  const stop = render(
    () =>
      h(() => {
        provide("count", value);
        return h(Child, null);
      }, null),
    container,
  );
  expect(container.textContent).toBe("1");
  value.value = 2;
  expect(container.textContent).toBe("2");
  stop();
  expect(cleanups).toBe(1);
  value.value = 3;
  expect(container.textContent).toBe("");
});

test("SSR request scopes remain isolated and cleanup executes once", () => {
  let cleanups = 0;
  function Page({ value }: { value: string }) {
    provide("request", value);
    return serverH(() => {
      onCleanup(() => cleanups++);
      return serverH("p", null, inject<string>("request"));
    }, null);
  }
  expect(renderToString(() => serverH(Page, { value: "<one>" }))).toBe(
    "<p>&lt;one&gt;</p>",
  );
  expect(renderToString(() => serverH(Page, { value: "two" }))).toBe(
    "<p>two</p>",
  );
  expect(cleanups).toBe(2);
});

test("initialization guards reject later access and defaults do not track setup dependencies", () => {
  expect(hasInjectionContext()).toBe(false);
  expect(() => provide("key", 1)).toThrow("initialization");
  expect(() => inject("key")).toThrow("initialization");
  expect(() => useId()).toThrow("initialization");
  const [value, setValue] = createSignal(0);
  let calls = 0,
    later!: () => void;
  createRoot((stop) => {
    createComputed(() =>
      createComponent(
        () => {
          calls++;
          expect(hasInjectionContext()).toBe(true);
          inject("missing", value, true);
          later = () => {
            expect(hasInjectionContext()).toBe(false);
            expect(() => provide("key", 2)).toThrow("initialization");
            expect(() => useId()).toThrow("initialization");
          };
        },
        {},
        "dom",
      ),
    );
    setValue(1);
    expect(calls).toBe(1);
    later();
    stop();
  });
});

test("useId generates deterministic tree-scoped IDs across DOM and SSR without leaking across renders", () => {
  expect(reactiveUseId).toBe(useId);
  function FieldDOM({ label }: { label: string }) {
    const id = useId();
    return h("div", null, h("label", { for: id }, label), h("input", { id }));
  }
  function FormDOM() {
    const formId = useId();
    const extraId = useId();
    return h(
      "form",
      { id: formId, "data-extra": extraId },
      h(FieldDOM, { label: "First" }),
      h(FieldDOM, { label: "Second" }),
    );
  }
  function FieldSSR({ label }: { label: string }) {
    const id = useId();
    return serverH(
      "div",
      null,
      serverH("label", { for: id }, label),
      serverH("input", { id }),
    );
  }
  function FormSSR() {
    const formId = useId();
    const extraId = useId();
    return serverH(
      "form",
      { id: formId, "data-extra": extraId },
      serverH(FieldSSR, { label: "First" }),
      serverH(FieldSSR, { label: "Second" }),
    );
  }

  const hostA = document.createElement("div");
  const hostB = document.createElement("div");
  const stopA = render(() => h(FormDOM, null), hostA);
  const stopB = render(() => h(FormDOM, null), hostB);
  const expected =
    '<form id="v-0" data-extra="v-1"><div><label for="v-2">First</label><input id="v-2"></div><div><label for="v-3">Second</label><input id="v-3"></div></form>';
  expect(hostA.innerHTML.replaceAll("<!---->", "")).toBe(expected);
  expect(hostB.innerHTML.replaceAll("<!---->", "")).toBe(expected);
  expect(renderToString(() => serverH(FormSSR, null))).toBe(expected);
  expect(renderToString(() => serverH(FormSSR, null))).toBe(expected);
  stopA();
  stopB();
});
