import { expect, test } from "bun:test";
import "../../react/test/dom";
import { createComponent } from "@tschk/moonshine-dom/component";
import { h, render } from "@tschk/moonshine-dom/dom";
import { h as hSSR, renderToString } from "@tschk/moonshine-dom/ssr";
import { inject, provide } from "../src/context";
import { createTextModel } from "../src/model";
import {
  createDefaultProps,
  createProps,
  withVueScheduler,
} from "../src/props";
import {
  createModel,
  isRef,
  ref,
  triggerRef,
  unref,
  useModel,
  watch,
  type ModelRef,
} from "../src/reactive";

test("createModel and useModel synchronize two-way v-model, controlled props, and standalone local state", () => {
  const container = document.createElement("div");
  document.body.append(container);

  const parentText = ref("initial");
  const parentCount = ref(5);
  let childTitle!: ModelRef<string>;
  let childCount!: ModelRef<number>;
  let childStandalone!: ModelRef<string>;

  const Child = (rawProps: Record<string, any>) => {
    const props = createProps<{ count: number }>(rawProps as any, ["count"]);
    childTitle = createModel<string>(rawProps, "modelValue", {
      default: "fallback",
    });
    childCount = useModel(props, "count");
    childStandalone = createModel<string>(rawProps, "standalone", {
      default: "local-init",
    });

    return h(
      "div",
      null,
      createTextModel(
        "input",
        {},
        () => childTitle.value,
        (next) => {
          childTitle.value = String(next);
        },
      ),
      h(
        "span",
        { class: "summary" },
        () =>
          `${childTitle.value}:${childCount.value}:${childStandalone.value}`,
      ),
    );
  };

  const dispose = render(
    () =>
      h(Child, {
        get modelValue() {
          return parentText.value;
        },
        "onUpdate:modelValue": (next: string) => {
          parentText.value = next;
        },
        get count() {
          return parentCount.value;
        },
        "onUpdate:count": (next: number) => {
          parentCount.value = next;
        },
      }),
    container,
  );

  const input = container.querySelector("input")!;
  const summary = container.querySelector(".summary")!;
  expect(isRef(childTitle)).toBe(true);
  expect(unref(childTitle)).toBe("initial");
  expect(input.value).toBe("initial");
  expect(summary.textContent).toBe("initial:5:local-init");

  // Child -> parent via input v-model
  input.value = "typed";
  input.dispatchEvent(new window.Event("input"));
  expect(parentText.value).toBe("typed");
  expect(childTitle.value).toBe("typed");
  expect(summary.textContent).toBe("typed:5:local-init");

  // Parent -> child reactive update
  parentText.value = "from-parent";
  parentCount.value = 12;
  expect(childTitle.value).toBe("from-parent");
  expect(childCount.value).toBe(12);
  expect(input.value).toBe("from-parent");
  expect(summary.textContent).toBe("from-parent:12:local-init");

  // Child -> parent via useModel
  childCount.value = 20;
  expect(parentCount.value).toBe(20);
  expect(summary.textContent).toBe("from-parent:20:local-init");

  // Standalone model without parent prop or listener updates locally
  childStandalone.value = "local-next";
  expect(childStandalone.value).toBe("local-next");
  expect(summary.textContent).toBe("from-parent:20:local-next");

  dispose();
  container.remove();
});

test("controlled parent prop that refuses update snaps child model back to parent value", () => {
  const container = document.createElement("div");
  document.body.append(container);

  const locked = ref("locked");
  const attempted: string[] = [];
  let model!: ModelRef<string>;

  const Controlled = (props: Record<string, any>) => {
    model = createModel<string>(props, "modelValue");
    return h("p", null, () => model.value);
  };

  const dispose = render(
    () =>
      h(Controlled, {
        get modelValue() {
          return locked.value;
        },
        "onUpdate:modelValue": (candidate: string) => {
          attempted.push(candidate);
          // Refuse values starting with "bad"
          if (!candidate.startsWith("bad")) {
            locked.value = candidate;
          }
        },
      }),
    container,
  );

  expect(model.value).toBe("locked");
  model.value = "bad-input";
  expect(attempted).toEqual(["bad-input"]);
  expect(model.value).toBe("locked");
  expect(container.textContent).toBe("locked");

  model.value = "good-input";
  expect(attempted).toEqual(["bad-input", "good-input"]);
  expect(model.value).toBe("good-input");
  expect(container.textContent).toBe("good-input");

  dispose();
  container.remove();
});

test("tuple destructuring, modelModifiers/modelValueModifiers/<name>Modifiers, get/set transforms, and normalization force-trigger", () => {
  const container = document.createElement("div");
  document.body.append(container);

  const rawText = ref("  hello  ");
  const rawSlug = ref("My Slug");
  const rawPrice = ref<number | string>(10);
  let titleModel!: ModelRef<string, "trim" | "capitalize">;
  let titleMods!: Record<"trim" | "capitalize", true | undefined>;
  let slugModel!: ModelRef<string, "lower" | "dash">;
  let slugMods!: Record<"lower" | "dash", true | undefined>;
  let priceModel!: ModelRef<number, "number">;
  const watchedTitle: string[] = [];

  const Editor = (props: Record<string, any>) => {
    [titleModel, titleMods] = createModel<string, "trim" | "capitalize">(
      props,
      "modelValue",
      {
        get: (v) =>
          titleMods.capitalize && v ? v[0]!.toUpperCase() + v.slice(1) : v,
        set: (v) => (titleMods.trim ? v.trim() : v),
      },
    );
    [slugModel, slugMods] = createModel<string, "lower" | "dash">(
      props,
      "slug",
      {
        set: (v) => {
          let out = v;
          if (slugMods.lower) out = out.toLowerCase();
          if (slugMods.dash) out = out.replace(/\s+/g, "-");
          return out;
        },
      },
    );
    [priceModel] = createModel<number, "number">(props, "price");

    watch(
      titleModel,
      (v) => {
        watchedTitle.push(v);
      },
      { flush: "sync" },
    );

    return h(
      "div",
      null,
      () => `${titleModel.value}|${slugModel.value}|${priceModel.value}`,
    );
  };

  const dispose = render(
    () =>
      h(Editor, {
        get modelValue() {
          return rawText.value;
        },
        modelValueModifiers: { trim: true, capitalize: true },
        "onUpdate:modelValue": (v: string) => {
          rawText.value = v;
        },
        get slug() {
          return rawSlug.value;
        },
        slugModifiers: { lower: true, dash: true },
        "onUpdate:slug": (v: string) => {
          rawSlug.value = v;
        },
        get price() {
          return rawPrice.value;
        },
        priceModifiers: { number: true },
        "onUpdate:price": (v: number) => {
          rawPrice.value = v;
        },
      }),
    container,
  );

  expect(titleMods).toEqual({ trim: true, capitalize: true });
  expect(Object.isFrozen(titleMods)).toBe(true);
  expect(slugMods).toEqual({ lower: true, dash: true });

  // Write via titleModel: custom set trims, emitter also sees modelValueModifiers.trim, get capitalizes
  titleModel.value = "   world   ";
  expect(rawText.value).toBe("world");
  expect(titleModel.value).toBe("World");
  expect(watchedTitle).toEqual(["World"]);

  // Assigning un-normalized "  world  " when rawText is already "world" still force-triggers
  titleModel.value = "  world  ";
  expect(rawText.value).toBe("world");
  expect(watchedTitle).toEqual(["World", "World"]);

  slugModel.value = "Hello World Again";
  expect(rawSlug.value).toBe("hello-world-again");
  expect(slugModel.value).toBe("hello-world-again");

  // Built-in .number modifier in createEmitter converts string to number
  (priceModel as unknown as ModelRef<string | number>).value = "42.5";
  expect(rawPrice.value).toBe(42.5);

  dispose();
  container.remove();
});

test("default factory caching with component injection context, soleFunction preservation, booleanCast, and withDefaults integration", async () => {
  let factoryCalls = 0;
  const injectedPrefix = Symbol("prefix");

  const container = document.createElement("div");
  document.body.append(container);

  const parentFlag = ref<boolean | string | undefined>("");
  const parentOptional = ref<string | undefined>("custom");
  let factoryModel!: ModelRef<{ label: string }>;
  let fnModel!: ModelRef<() => string>;
  let boolModel!: ModelRef<boolean>;
  let omittedBoolModel!: ModelRef<boolean>;
  let defaultedPropModel!: ModelRef<string>;

  const Child = (rawProps: Record<string, any>) =>
    withVueScheduler(() => {
      const { props } = createDefaultProps<{ opt?: string }, { opt: string }>(
        rawProps as any,
        ["opt"],
        [],
        [["opt", "from-with-defaults", false]],
      );

      factoryModel = createModel<{ label: string }>(rawProps, "item", {
        default: () => {
          factoryCalls++;
          const prefix = inject(injectedPrefix, "none");
          return { label: `${prefix}:created` };
        },
      });
      const defaultFn = () => "sole-fn-result";
      fnModel = createModel<() => string>(
        rawProps,
        "callback",
        { default: defaultFn },
        undefined,
        true,
      );
      boolModel = createModel<boolean>(rawProps, "isActive", undefined, true);
      omittedBoolModel = createModel<boolean>(
        rawProps,
        "isOmitted",
        undefined,
        true,
      );
      defaultedPropModel = useModel(props, "opt");

      return h(
        "div",
        null,
        () =>
          `${factoryModel.value.label}|${fnModel.value()}|${boolModel.value}|${omittedBoolModel.value}|${defaultedPropModel.value}`,
      );
    });

  const dispose = render(
    () =>
      h(() => {
        provide(injectedPrefix, "ctx");
        return h(Child, {
          get "is-active"() {
            return parentFlag.value;
          },
          get opt() {
            return parentOptional.value;
          },
        });
      }, {}),
    container,
  );

  expect(factoryCalls).toBe(1);
  expect(factoryModel.value).toEqual({ label: "ctx:created" });
  expect(typeof fnModel.value).toBe("function");
  expect(fnModel.value()).toBe("sole-fn-result");
  expect(boolModel.value).toBe(true);
  expect(omittedBoolModel.value).toBe(false);
  expect(defaultedPropModel.value).toBe("custom");

  // Transition hyphenated prop name literal "is-active" -> true, then false
  parentFlag.value = "is-active";
  expect(boolModel.value).toBe(true);
  parentFlag.value = false;
  expect(boolModel.value).toBe(false);

  // Transition parentOptional from "custom" to undefined -> resolves to withDefaults default after microtask
  parentOptional.value = undefined;
  await Promise.resolve();
  expect(defaultedPropModel.value).toBe("from-with-defaults");
  expect(factoryCalls).toBe(1);

  // triggerRef on modelRef triggers watchers
  let triggered = 0;
  watch(
    factoryModel,
    () => {
      triggered++;
    },
    { flush: "sync" },
  );
  triggerRef(factoryModel);
  expect(triggered).toBe(1);

  dispose();
  container.remove();
});

test("SSR support and validation guards for useModel / createModel", () => {
  expect(() => useModel({ a: 1 }, "a")).toThrow(
    "Component context is available only during native component initialization",
  );
  createComponent(
    () => {
      expect(() => useModel(null as any, "a")).toThrow(
        "useModel requires a props object",
      );
      expect(() => useModel({ a: 1 }, "" as any)).toThrow(
        "useModel requires a non-empty string prop name",
      );
    },
    {},
    "dom",
  );

  const emittedInSSR: string[] = [];
  const html = renderToString(() =>
    createComponent(
      (rawProps: Record<string, any>) => {
        const [model, mods] = createModel<string, "trim">(
          rawProps,
          "modelValue",
          {
            default: "ssr-default",
            get: (v) => (mods.trim ? v.trim() : v),
          },
        );
        const flag = createModel<boolean>(rawProps, "enabled", undefined, true);
        model.value = "  updated-in-ssr  ";
        return hSSR("span", null, `${model.value}:${flag.value}`);
      },
      {
        modelModifiers: { trim: true },
        enabled: "",
        "onUpdate:modelValue": (v: string) => {
          emittedInSSR.push(v);
        },
      },
      "ssr",
    ),
  );

  expect(emittedInSSR).toEqual(["updated-in-ssr"]);
  expect(html).toBe("<span>updated-in-ssr:true</span>");
});
