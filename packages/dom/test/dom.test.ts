import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { h, render, type DOMChild } from "../src/dom";
import { batch, createSignal, onCleanup, onMount } from "../src/reactive";
import { For, Index, Show } from "../src/control";
import { createSignal as kernelSignal } from "@tschk/moonshine";
import "../../react/test/dom";

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.replaceChildren();
});

describe("independent DOM runtime", () => {
  test("updates escaped text in place and disposes reactive work", () => {
    const container = document.createElement("main");
    document.body.append(container);
    const [text, setText] = createSignal("<script>bad()</script>");
    let reads = 0;
    dispose = render(
      () =>
        h("p", null, () => {
          reads++;
          return text();
        }),
      container,
    );
    const paragraph = container.querySelector("p")!;
    const textNode = paragraph.firstChild;
    expect(paragraph.textContent).toBe("<script>bad()</script>");
    expect(container.querySelector("script")).toBeNull();
    setText("next");
    expect(paragraph.textContent).toBe("next");
    expect(paragraph.firstChild).toBe(textNode);
    expect(reads).toBe(2);
    dispose();
    setText("ignored");
    expect(reads).toBe(2);
    expect(container.childNodes).toHaveLength(0);
  });

  test("event handlers update attributes and text and are removed on disposal", () => {
    const container = document.createElement("main");
    const [count, setCount] = createSignal(0);
    let button!: HTMLElement;
    dispose = render(() => {
      button = h(
        "button",
        {
          onClick: () => setCount(count() + 1),
          "aria-pressed": () => count() > 0,
          disabled: () => count() > 1,
        },
        count,
      );
      return button;
    }, container);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    button.click();
    expect(button.textContent).toBe("1");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    button.click();
    expect(button.hasAttribute("disabled")).toBe(true);
    dispose();
    button.dispatchEvent(new Event("click"));
    expect(count()).toBe(2);
  });

  test("preserves input identity, focus and selection on adjacent updates", () => {
    const container = document.createElement("main");
    document.body.append(container);
    const [text, setText] = createSignal("hello");
    const [label, setLabel] = createSignal("one");
    let input!: HTMLInputElement;
    dispose = render(() => {
      input = h("input", {
        value: text,
        "on:input": (event: Event) =>
          setText((event.target as HTMLInputElement).value),
      }) as HTMLInputElement;
      return [input, label];
    }, container);
    input.focus();
    input.setSelectionRange(2, 2);
    setLabel("two");
    expect(container.firstChild).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    input.value = "typed";
    input.dispatchEvent(new Event("input"));
    expect(text()).toBe("typed");
    setText("external");
    expect(input.value).toBe("external");
  });

  test("reorders retained nodes and removes only its mounted region", () => {
    const container = document.createElement("main");
    const existing = document.createElement("aside");
    container.append(existing);
    const left = document.createElement("b");
    const right = document.createElement("i");
    const [flipped, setFlipped] = createSignal(false);
    dispose = render(
      () => () => (flipped() ? [right, left] : [left, right]),
      container,
    );
    setFlipped(true);
    expect(Array.from(container.children)).toEqual([existing, right, left]);
    dispose();
    expect(Array.from(container.childNodes)).toEqual([existing]);
  });

  test("changing dynamic branches disposes their owned listeners", () => {
    const container = document.createElement("main");
    const [shown, setShown] = createSignal(true);
    let clicks = 0;
    let cleanups = 0;
    dispose = render(
      () => () => {
        if (!shown()) return null;
        onCleanup(() => {
          cleanups++;
        });
        return h("button", { onClick: () => clicks++ }, "go");
      },
      container,
    );
    const old = container.querySelector("button")!;
    old.click();
    setShown(false);
    old.click();
    expect(clicks).toBe(1);
    expect(cleanups).toBe(1);
    expect(container.querySelector("button")).toBeNull();
  });

  test("failed mounting cleans listeners without removing existing content", () => {
    const container = document.createElement("main");
    container.textContent = "existing";
    let button!: HTMLElement;
    let clicks = 0;
    expect(() =>
      render(() => {
        button = h("button", { onClick: () => clicks++ }, "go");
        throw new Error("mount failed");
      }, container),
    ).toThrow("mount failed");
    button.click();
    expect(clicks).toBe(0);
    expect(container.textContent).toBe("existing");
  });

  test("mount errors survive cleanup failures and all remaining cleanups run", () => {
    const container = document.createElement("main");
    let cleaned = false;
    expect(() =>
      render(() => {
        onCleanup(() => {
          throw new Error("cleanup failed");
        });
        onCleanup(() => {
          cleaned = true;
        });
        throw new Error("mount failed");
      }, container),
    ).toThrow("mount failed");
    expect(cleaned).toBe(true);
    expect(container.childNodes).toHaveLength(0);
  });

  test("select values are applied after options exist, including accessor children", () => {
    const container = document.createElement("main");
    const [value, setValue] = createSignal("b");
    dispose = render(
      () => [
        h(
          "select",
          { value: "b" },
          h("option", { value: "a" }, "A"),
          h("option", { value: "b" }, "B"),
        ),
        h("select", { value }, () => [
          h("option", { value: "a" }, "A"),
          h("option", { value: "b" }, "B"),
        ]),
      ],
      container,
    );
    const selects = container.querySelectorAll("select");
    for (const select of selects) {
      expect(select.value).toBe("b");
      expect(Array.from(select.options, (option) => option.selected)).toEqual([
        false,
        true,
      ]);
    }
    setValue("a");
    expect(selects[1]!.value).toBe("a");
    expect(selects[1]!.selectedIndex).toBe(0);
  });

  test("select value setters never run before their initial options are mounted", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )!;
    const optionCounts: number[] = [];
    Object.defineProperty(HTMLSelectElement.prototype, "value", {
      ...descriptor,
      set(this: HTMLSelectElement, value: string) {
        optionCounts.push(this.options.length);
        descriptor.set!.call(this, value);
      },
    });
    try {
      const container = document.createElement("main");
      dispose = render(
        () =>
          h(
            "select",
            { value: "a" },
            h("option", { value: "a" }, "A"),
            h("option", { value: "b" }, "B"),
          ),
        container,
      );
      expect(optionCounts).toEqual([2]);
    } finally {
      Object.defineProperty(HTMLSelectElement.prototype, "value", descriptor);
    }
  });

  test("multiple selects match exact string values and update controlled selections", () => {
    const container = document.createElement("main");
    const [value, setValue] = createSignal<Array<string | number>>([1, "01"]);
    dispose = render(
      () =>
        h(
          "select",
          { value, multiple: true },
          h("option", { value: "1" }, "one"),
          h("option", { value: "01" }, "zero one"),
          h("option", { value: "10" }, "ten"),
        ),
      container,
    );
    const select = container.querySelector("select")!;
    const selected = () =>
      Array.from(select.options)
        .filter((option) => option.selected)
        .map((option) => option.value);
    expect(selected()).toEqual(["1", "01"]);
    setValue(["10"]);
    expect(selected()).toEqual(["10"]);
    setValue([]);
    expect(selected()).toEqual([]);
  });

  test("single selects reject value arrays instead of stringifying them", () => {
    const container = document.createElement("main");
    expect(() =>
      render(
        () => h("select", { value: ["a"] }, h("option", { value: "a" }, "A")),
        container,
      ),
    ).toThrow("Single select value cannot be an array");
    expect(container.childNodes).toHaveLength(0);
  });

  test("controlled selects reapply values after option-only and optgroup updates", () => {
    const container = document.createElement("main");
    const [options, setOptions] = createSignal(["a", "b"]);
    let reads = 0;
    const items = () => {
      reads++;
      return options().map((value) => h("option", { value }, value));
    };
    dispose = render(
      () => [
        h("select", { value: "b" }, items),
        h(
          "select",
          { value: ["b", "c"], multiple: true },
          h("optgroup", { label: "group" }, items),
        ),
      ],
      container,
    );
    const selects = container.querySelectorAll("select");
    const selected = (select: HTMLSelectElement) =>
      Array.from(select.options)
        .filter((option) => option.selected)
        .map((option) => option.value);
    expect(selected(selects[0]!)).toEqual(["b"]);
    expect(selected(selects[1]!)).toEqual(["b"]);
    setOptions(["a", "b", "c"]);
    expect(selected(selects[0]!)).toEqual(["b"]);
    expect(selected(selects[1]!)).toEqual(["b", "c"]);
    setOptions(["c", "a"]);
    expect(selected(selects[0]!)).toEqual([]);
    expect(selected(selects[1]!)).toEqual(["c"]);
    dispose();
    const before = reads;
    setOptions(["b"]);
    expect(reads).toBe(before);
  });

  test("ref receives the actual element once without tracking its signal reads", () => {
    const container = document.createElement("main");
    const [value, setValue] = createSignal("one");
    let calls = 0;
    let cleaned = 0;
    let referenced: Element | undefined;
    dispose = render(
      () => () =>
        h("input", {
          ref: (element: Element) => {
            calls++;
            value();
            referenced = element;
            onCleanup(() => {
              cleaned++;
            });
          },
        }),
      container,
    );
    expect(referenced).toBe(container.querySelector("input")!);
    expect(referenced!.hasAttribute("ref")).toBe(false);
    setValue("two");
    expect(calls).toBe(1);
    expect(container.querySelector("input")).toBe(referenced);
    expect(cleaned).toBe(0);
    dispose();
    expect(cleaned).toBe(1);
  });

  test("refs forward through component props and reject noncallback values", () => {
    const container = document.createElement("main");
    let referenced: Element | undefined;
    const Component = (props: {
      ref: (element: Element) => void;
      children?: DOMChild;
    }) => h("button", { ref: props.ref }, props.children);
    dispose = render(
      () =>
        h(
          Component,
          {
            get ref() {
              return (element: Element) => {
                referenced = element;
              };
            },
          },
          "go",
        ),
      container,
    );
    expect(referenced).toBe(container.querySelector("button")!);
    for (const ref of ["input", false, {}])
      expect(() => h("input", { ref })).toThrow("ref must be a callback");
    expect(h("input", { ref: null }).hasAttribute("ref")).toBe(false);
  });

  test("failed ref callbacks finish owned cleanup while preserving the callback error", () => {
    const container = document.createElement("main");
    let cleaned = 0;
    expect(() =>
      render(
        () =>
          h("input", {
            ref: () => {
              onCleanup(() => {
                throw new Error("cleanup failed");
              });
              onCleanup(() => {
                cleaned++;
              });
              throw new Error("ref failed");
            },
          }),
        container,
      ),
    ).toThrow("ref failed");
    expect(cleaned).toBe(1);
    expect(container.childNodes).toHaveLength(0);
  });

  test("HTML booleans use presence while enumerated, data and ARIA values stay strings", () => {
    const container = document.createElement("main");
    const [value, setValue] = createSignal<boolean | null>(false);
    dispose = render(
      () =>
        h("button", {
          disabled: value,
          hidden: value,
          contenteditable: value,
          spellcheck: value,
          draggable: value,
          "data-active": value,
          "aria-pressed": value,
        }),
      container,
    );
    const button = container.querySelector("button")!;
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.hasAttribute("hidden")).toBe(false);
    for (const name of [
      "contenteditable",
      "spellcheck",
      "draggable",
      "data-active",
      "aria-pressed",
    ])
      expect(button.getAttribute(name)).toBe("false");
    setValue(true);
    expect(button.getAttribute("disabled")).toBe("");
    expect(button.getAttribute("hidden")).toBe("");
    for (const name of [
      "contenteditable",
      "spellcheck",
      "draggable",
      "data-active",
      "aria-pressed",
    ])
      expect(button.getAttribute(name)).toBe("true");
    setValue(null);
    expect(button.attributes.length).toBe(0);
    expect(h("div", { hidden: "until-found" }).getAttribute("hidden")).toBe(
      "until-found",
    );
  });

  test("SVG boolean-shaped attribute values are always strings and null removes them", () => {
    const container = document.createElement("main");
    const [value, setValue] = createSignal<boolean | null>(false);
    dispose = render(
      () =>
        h("svg", { hidden: value }, () =>
          h("a", { disabled: value, "aria-hidden": value }),
        ),
      container,
    );
    const svg = container.querySelector("svg")!;
    const link = container.querySelector("a")!;
    expect(svg.getAttribute("hidden")).toBe("false");
    expect(link.getAttribute("disabled")).toBe("false");
    setValue(true);
    expect(svg.getAttribute("hidden")).toBe("true");
    expect(link.getAttribute("disabled")).toBe("true");
    setValue(null);
    expect(svg.hasAttribute("hidden")).toBe(false);
    expect(link.hasAttribute("disabled")).toBe(false);
  });

  test("SVG elements use real namespaces, update namespaced attributes and clean up events", () => {
    const container = document.createElement("main");
    const [radius, setRadius] = createSignal(2);
    const [href, setHref] = createSignal<string | null>("#one");
    let clicks = 0;
    let circle!: SVGCircleElement;
    dispose = render(
      () =>
        h(
          "svg",
          { viewBox: "0 0 10 10" },
          h(
            "g",
            null,
            (circle = h("circle", { r: radius, onClick: () => clicks++ })),
          ),
          h("use", { "xlink:href": href }),
        ),
      container,
    );
    const svg = container.querySelector("svg")!;
    const use = container.querySelector("use")!;
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(circle.namespaceURI).toBe(svg.namespaceURI);
    expect(circle.parentElement!.namespaceURI).toBe(svg.namespaceURI);
    expect(svg.getAttribute("viewBox")).toBe("0 0 10 10");
    setRadius(4);
    expect(circle.getAttribute("r")).toBe("4");
    expect(use.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe(
      "#one",
    );
    setHref(null);
    expect(use.hasAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe(
      false,
    );
    circle.dispatchEvent(new Event("click"));
    expect(clicks).toBe(1);
    dispose();
    circle.dispatchEvent(new Event("click"));
    expect(clicks).toBe(1);
  });

  test("accessor SVG context and foreignObject HTML context are restored across components", () => {
    const container = document.createElement("main");
    const [label, setLabel] = createSignal("hello");
    const Link = () => h("a", { href: "#item" }, label);
    dispose = render(
      () => [
        h("svg", null, () => [
          h(Link, null),
          h("foreignObject", null, () =>
            h(
              "div",
              null,
              h("a", { href: "/" }, "html"),
              h("svg", null, () => h("title", null, "nested")),
            ),
          ),
        ]),
        h("a", null, "outside"),
      ],
      container,
    );
    const svg = container.querySelector("svg")!;
    const svgLink = svg.querySelector("a")!;
    const html = svg.querySelector("foreignObject div")!;
    const nestedTitle = html.querySelector("title")!;
    expect(svgLink.namespaceURI).toBe(svg.namespaceURI);
    expect(html.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(html.querySelector("a")!.namespaceURI).toBe(html.namespaceURI);
    expect(nestedTitle.namespaceURI).toBe(svg.namespaceURI);
    expect(container.lastElementChild!.namespaceURI).toBe(html.namespaceURI);
    setLabel("updated");
    expect(svgLink.textContent).toBe("updated");
  });

  test("render inherits an SVG container namespace and explicit xmlns handles eager ambiguous tags", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    dispose = render(() => h("a", { href: "#root" }, "root"), svg);
    expect(svg.firstElementChild!.namespaceURI).toBe(svg.namespaceURI);
    const explicit = h("a", { xmlns: svg.namespaceURI }, "explicit");
    expect(explicit.namespaceURI).toBe(svg.namespaceURI);
    expect(
      explicit.getAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns"),
    ).toBe(svg.namespaceURI);
    expect(h("a").namespaceURI).toBe("http://www.w3.org/1999/xhtml");
  });

  test("component factories preserve reactive props, children and ownership", () => {
    const container = document.createElement("main");
    const [label, setLabel] = createSignal("one");
    let cleaned = 0;
    const Component = (props: { label: string; children?: DOMChild }) => {
      onCleanup(() => {
        cleaned++;
      });
      return h("p", null, () => props.label, props.children);
    };
    dispose = render(
      () =>
        h(
          Component,
          {
            get label() {
              return label();
            },
          },
          " child",
        ),
      container,
    );
    expect(container.textContent).toBe("one child");
    setLabel("two");
    expect(container.textContent).toBe("two child");
    dispose();
    expect(cleaned).toBe(1);
    expect(container.childNodes).toHaveLength(0);
  });

  test("component children preserve own enumerable props and reactive getters", () => {
    const container = document.createElement("main");
    const [label, setLabel] = createSignal("one");
    let keys: string[] = [];
    const Component = (props: {
      id: string;
      title: () => string;
      label: string;
      children?: DOMChild;
    }) => {
      keys = Object.keys(props);
      const { children, label: _label, ...attributes } = props;
      return h("p", { ...attributes }, () => props.label, children);
    };
    dispose = render(
      () =>
        h(
          Component,
          {
            id: "own-props",
            title: label,
            get label() {
              return label();
            },
          },
          " child",
        ),
      container,
    );
    const paragraph = container.querySelector("p")!;
    expect(keys).toEqual(["id", "title", "label", "children"]);
    expect(paragraph.id).toBe("own-props");
    expect(paragraph.title).toBe("one");
    setLabel("two");
    expect(paragraph.textContent).toBe("two child");
    expect(paragraph.title).toBe("two");
  });

  test("explicit retained Text nodes cannot be reused for different text slots", () => {
    for (const first of [true, false]) {
      const container = document.createElement("main");
      const [children, setChildren] = createSignal<DOMChild>(["a", "b"]);
      let reads = 0;
      dispose = render(
        () => () => {
          reads++;
          return children();
        },
        container,
      );
      const saved = container.childNodes[1]!;
      setChildren(first ? [saved, "c"] : ["c", saved]);
      expect(container.textContent).toBe(first ? "bc" : "cb");
      expect(saved.textContent).toBe("b");
      expect(container.childNodes[first ? 0 : 1]).toBe(saved);
      expect(reads).toBe(2);
      dispose();
    }
  });

  test("style objects update CSS properties and remove stale owned keys", () => {
    const container = document.createElement("main");
    const [value, setValue] = createSignal<
      Record<string, string | number | null>
    >({
      color: "red",
      "background-color": "black",
      "--Theme": "one",
      opacity: 0,
    });
    dispose = render(() => h("div", { style: value }), container);
    const element = container.querySelector("div")!;
    expect(element.style.color).toBe("red");
    expect(element.style.backgroundColor).toBe("black");
    expect(element.style.getPropertyValue("--Theme")).toBe("one");
    expect(element.style.opacity).toBe("0");
    element.style.setProperty("border-width", "1px");
    setValue({ color: "blue", "--Theme": null });
    expect(element.style.color).toBe("blue");
    expect(element.style.backgroundColor).toBe("");
    expect(element.style.getPropertyValue("--Theme")).toBe("");
    expect(element.style.opacity).toBe("");
    expect(element.style.borderWidth).toBe("1px");
    dispose();
    setValue({ color: "green" });
    expect(element.style.color).toBe("blue");
  });

  test("styles transition between strings, objects and null without retaining stale declarations", () => {
    const container = document.createElement("main");
    const [value, setValue] = createSignal<
      string | Record<string, string> | null
    >("color: red; background-color: black");
    dispose = render(() => h("div", { style: value }), container);
    const element = container.querySelector("div")!;
    expect(element.style.color).toBe("red");
    setValue({ color: "blue" });
    expect(element.style.color).toBe("blue");
    expect(element.style.backgroundColor).toBe("");
    setValue("opacity: 0.5");
    expect(element.style.color).toBe("");
    expect(element.style.opacity).toBe("0.5");
    setValue(null);
    expect(element.hasAttribute("style")).toBe(false);
    expect(h("div", { style: false }).hasAttribute("style")).toBe(false);
    for (const style of [true, 0])
      expect(() => h("div", { style })).toThrow("style must be a CSS string");
  });

  test("unsupported style records fail before altering existing declarations", () => {
    const container = document.createElement("main");
    const [value, setValue] = createSignal<object>({ color: "red" });
    dispose = render(() => h("div", { style: value }), container);
    const element = container.querySelector("div")!;
    for (const invalid of [
      { backgroundColor: "black" },
      { color: "blue; display: none" },
      { color: "blue !important" },
      { color: {} },
      [],
      new Date(),
    ]) {
      expect(() => setValue(invalid)).toThrow();
      expect(element.style.color).toBe("red");
    }
    const nullPrototype = Object.assign(Object.create(null), {
      color: "green",
    });
    setValue(nullPrototype);
    expect(element.style.color).toBe("green");
  });
});

test("explicit form defaults initialize controls and restore them on reset", () => {
  const container = document.createElement("main");
  dispose = render(
    () =>
      h(
        "form",
        null,
        h("input", { name: "title", defaultValue: "prefill" }),
        h("textarea", { defaultValue: "notes" }, "ignored children"),
        h("input", { defaultChecked: true, type: "checkbox" }),
        h("input", { type: "checkbox", defaultChecked: true }),
      ),
    container,
  );
  const form = container.querySelector("form")!;
  const input = form.querySelector<HTMLInputElement>("input[name=title]")!;
  const textarea = form.querySelector("textarea")!;
  const checks = Array.from(
    form.querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
  );
  expect(input.value).toBe("prefill");
  expect(input.defaultValue).toBe("prefill");
  expect(textarea.value).toBe("notes");
  expect(textarea.textContent).toBe("notes");
  expect(textarea.defaultValue).toBe("notes");
  input.value = "edited";
  textarea.value = "edited";
  for (const checkbox of checks) {
    expect(checkbox.checked).toBe(true);
    checkbox.checked = false;
  }
  form.reset();
  expect(input.value).toBe("prefill");
  expect(textarea.value).toBe("notes");
  expect(checks.every((checkbox) => checkbox.checked)).toBe(true);
  expect(container.querySelector("[defaultvalue],[defaultchecked]")).toBeNull();
});

test("live values override defaults independent of prop order without changing reset baselines", () => {
  for (const reverse of [false, true]) {
    const inputProps = reverse
      ? { value: "live", defaultValue: "initial" }
      : { defaultValue: "initial", value: "live" };
    const checkedProps = reverse
      ? { checked: false, defaultChecked: true }
      : { defaultChecked: true, checked: false };
    const container = document.createElement("main");
    dispose = render(
      () =>
        h(
          "form",
          null,
          h("input", inputProps),
          h("textarea", inputProps, "ignored"),
          h("input", { ...checkedProps, type: "checkbox" }),
        ),
      container,
    );
    const form = container.querySelector("form")!;
    const input = form.querySelector("input")!;
    const textarea = form.querySelector("textarea")!;
    const checkbox = form.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    )!;
    expect(input.value).toBe("live");
    expect(textarea.value).toBe("live");
    expect(checkbox.checked).toBe(false);
    form.reset();
    expect(input.value).toBe("initial");
    expect(textarea.value).toBe("initial");
    expect(checkbox.checked).toBe(true);
    dispose();
  }
});

test("reactive defaults leave dirty values alone and update the next reset", () => {
  const [value, setValue] = createSignal("initial");
  const [checked, setChecked] = createSignal(true);
  const container = document.createElement("main");
  dispose = render(
    () =>
      h(
        "form",
        null,
        h("input", { defaultValue: value }),
        h("textarea", { defaultValue: value }),
        h("input", { type: "checkbox", defaultChecked: checked }),
      ),
    container,
  );
  const form = container.querySelector("form")!;
  const input = form.querySelector("input")!;
  const textarea = form.querySelector("textarea")!;
  const checkbox = form.querySelector<HTMLInputElement>(
    "input[type=checkbox]",
  )!;
  input.value = "typed";
  textarea.value = "typed";
  checkbox.checked = false;
  setValue("next");
  setChecked(false);
  expect(input.value).toBe("typed");
  expect(textarea.value).toBe("typed");
  expect(checkbox.checked).toBe(false);
  form.reset();
  expect(input.value).toBe("next");
  expect(textarea.value).toBe("next");
  expect(checkbox.checked).toBe(false);
});

test("unsupported default props fail explicitly instead of creating inert attributes", () => {
  expect(() => h("select", { defaultValue: "b" })).toThrow(
    "only on input and textarea",
  );
  expect(() => h("div", { defaultValue: "text" })).toThrow(
    "only on input and textarea",
  );
  expect(() => h("textarea", { defaultChecked: true })).toThrow(
    "only on input",
  );
});

test("form property getters are captured once and explicit textarea values ignore children", () => {
  let reads = 0;
  const input = h("input", {
    get defaultValue() {
      reads++;
      return "initial";
    },
    get value() {
      reads++;
      return "live";
    },
  });
  expect(reads).toBe(2);
  expect(input.value).toBe("live");
  expect(input.defaultValue).toBe("initial");
  const ignored = () => {
    throw new Error("ignored child executed");
  };
  for (const props of [{ value: undefined }, { defaultValue: undefined }]) {
    expect(h("textarea", props, ignored).value).toBe("");
  }
});

test("host props.children renders reactive children instead of an attribute", () => {
  const [text, set] = createSignal("hello");
  const container = document.createElement("main");
  dispose = render(
    () => h("p", { children: [() => text(), h("b", null, "!")] }),
    container,
  );
  const paragraph = container.querySelector("p")!;
  expect(paragraph.hasAttribute("children")).toBe(false);
  expect(paragraph.textContent).toBe("hello!");
  set("updated");
  expect(paragraph.textContent).toBe("updated!");
});

test("forwarded component children getters stay reactive and are not eagerly copied", () => {
  const [text, set] = createSignal("first");
  let reads = 0;
  const props = {
    get children() {
      reads++;
      return text();
    },
  };
  const Forward = (value: typeof props) => {
    expect(reads).toBe(0);
    return h("p", value);
  };
  const container = document.createElement("main");
  dispose = render(() => h(Forward, props), container);
  expect(reads).toBe(1);
  expect(container.textContent).toBe("first");
  set("second");
  expect(reads).toBe(2);
  expect(container.textContent).toBe("second");
});

test("variadic children override host and component children without reading discarded getters", () => {
  const props = {
    get children(): DOMChild {
      throw Error("discarded getter");
    },
  };
  expect(h("p", props, "explicit").textContent).toBe("explicit");
  expect(h("p", props, undefined).textContent).toBe("");
  expect(
    (
      h(
        (value: { children?: DOMChild }) => h("p", value),
        props,
        "forwarded",
      ) as HTMLElement
    ).textContent,
  ).toBe("forwarded");
});

test("textarea explicit form values suppress props.children getters; uncontrolled children render", () => {
  let reads = 0;
  for (const value of [
    { value: "live" },
    { defaultValue: "initial" },
    { value: undefined },
  ]) {
    const textarea = h("textarea", {
      ...value,
      get children() {
        reads++;
        throw Error("ignored child");
      },
    });
    expect(textarea.value).toBe(
      "value" in value ? (value.value ?? "") : value.defaultValue!,
    );
  }
  expect(reads).toBe(0);
  const textarea = h("textarea", { children: "notes" });
  expect(textarea.value).toBe("notes");
  expect(textarea.textContent).toBe("notes");
});

test("scalar accessor updates retain text through nested wrappers and restore moved nodes", () => {
  const container = document.createElement("main");
  const [value, setValue] = createSignal<DOMChild>("a");
  let reads = 0;
  dispose = render(
    () =>
      h("p", null, () => [
        () => {
          reads++;
          return value();
        },
      ]),
    container,
  );
  const paragraph = container.querySelector("p")!;
  const first = paragraph.firstChild!;
  for (const next of ["", 0, 12n, "<&"]) {
    setValue(next);
    expect(paragraph.firstChild).toBe(first);
    expect(paragraph.textContent).toBe(String(next));
  }
  expect(reads).toBe(5);
  document.body.appendChild(first);
  setValue("restored");
  expect(paragraph.firstChild).toBe(first);
  expect(paragraph.textContent).toBe("restored");
  for (const next of [false, null, undefined]) {
    setValue(next);
    expect(paragraph.textContent).toBe("");
  }
  setValue(["a", "b"]);
  const second = paragraph.childNodes[1]!;
  setValue([second, "c"]);
  expect(paragraph.textContent).toBe("bc");
  expect(paragraph.firstChild).toBe(second);
});

test("scalar option text updates reapply controlled select values", () => {
  const container = document.createElement("main");
  const [label, setLabel] = createSignal("a");
  dispose = render(
    () =>
      h("select", { multiple: true, value: ["b"] }, h("option", null, label)),
    container,
  );
  const select = container.querySelector("select")!;
  expect(select.options[0]!.selected).toBe(false);
  setLabel("b");
  expect(select.value).toBe("b");
  expect(select.options[0]!.selected).toBe(true);
  setLabel("a");
  expect(select.options[0]!.selected).toBe(false);
});

test("end-to-front keyed rotation moves one row and retains all other rows", () => {
  for (const length of [3, 100]) {
    const container = document.createElement("main");
    const original = Array.from({ length }, (_, index) =>
      h("li", null, String(index)),
    );
    const [rows, setRows] = createSignal(original);
    dispose = render(() => h("ul", null, rows), container);
    const list = container.querySelector("ul")!;
    const insert = spyOn(list, "insertBefore");
    try {
      const rotated = [original[length - 1]!, ...original.slice(0, -1)];
      setRows(rotated);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert.mock.calls[0]).toEqual([rotated[0], original[0]]);
      expect(Array.from(list.children)).toEqual(rotated);
      setRows(original);
      expect(Array.from(list.children)).toEqual(original);
    } finally {
      insert.mockRestore();
      dispose();
    }
  }
});

test("select prop getters are captured once and retained for option updates", () => {
  const container = document.createElement("main");
  let valueReads = 0;
  let multipleReads = 0;
  const [label, setLabel] = createSignal("b");
  dispose = render(
    () =>
      h(
        "select",
        {
          get value() {
            return ++valueReads === 1 ? "b" : "a";
          },
          get multiple() {
            multipleReads++;
            return false;
          },
        },
        h("option", null, label),
        h("option", { value: "a" }, "second"),
      ),
    container,
  );
  const select = container.querySelector("select")!;
  expect(valueReads).toBe(1);
  expect(multipleReads).toBe(1);
  expect(select.value).toBe("b");
  expect(select.selectedIndex).toBe(0);
  setLabel("c");
  expect(select.value).toBe("");
  expect(select.selectedIndex).toBe(-1);
  setLabel("b");
  expect(select.value).toBe("b");
  expect(select.selectedIndex).toBe(0);
  expect(valueReads).toBe(1);
  expect(multipleReads).toBe(1);
});

test("select ignores inherited value getters consistently with other props", () => {
  const props = Object.create({
    get value() {
      throw new Error("inherited value read");
    },
  });
  let select!: HTMLSelectElement;
  expect(() => {
    select = h("select", props, h("option", { value: "a" }, "first"));
  }).not.toThrow();
  expect(select.value).toBe("a");
});

test("reactive option values resynchronize controlled selection through optgroups", () => {
  const container = document.createElement("main");
  const [optionValue, setOptionValue] = createSignal("b");
  const [selection, setSelection] = createSignal(["b"]);
  let optionReads = 0;
  let selectionReads = 0;
  dispose = render(
    () =>
      h(
        "select",
        {
          multiple: true,
          value: () => {
            selectionReads++;
            return selection();
          },
        },
        h(
          "optgroup",
          { label: "choices" },
          h(
            "option",
            {
              value: () => {
                optionReads++;
                return optionValue();
              },
            },
            "choice",
          ),
        ),
      ),
    container,
  );
  const option = container.querySelector("option")!;
  expect(option.selected).toBe(true);
  setOptionValue("c");
  expect(option.selected).toBe(false);
  setOptionValue("b");
  expect(option.selected).toBe(true);
  const reads = optionReads;
  setSelection(["c"]);
  expect(option.selected).toBe(false);
  expect(optionReads).toBe(reads);
  expect(selectionReads).toBeGreaterThan(1);
  dispose();
  const afterDispose = optionReads;
  setOptionValue("c");
  expect(optionReads).toBe(afterDispose);
});

test("event listener objects support capture, once, this binding and owned cleanup", () => {
  const container = document.createElement("main");
  const calls: string[] = [];
  let parent!: HTMLElement;
  let button!: HTMLButtonElement;
  const listener = {
    capture: true,
    handleEvent(this: { capture: boolean }, event: Event) {
      expect(this).toBe(listener);
      expect(event.currentTarget).toBe(parent);
      calls.push("capture");
    },
  };
  const once = {
    once: true,
    handleEvent() {
      calls.push("once");
    },
  };
  dispose = render(
    () =>
      (parent = h(
        "div",
        { "on:click": listener },
        (button = h("button", {
          onClick(event: Event) {
            calls.push("child");
            event.stopPropagation();
          },
          "on:customCase": once,
        })),
      )),
    container,
  );
  button.click();
  expect(calls).toEqual(["capture", "child"]);
  button.dispatchEvent(new Event("customCase"));
  button.dispatchEvent(new Event("customCase"));
  expect(calls).toEqual(["capture", "child", "once"]);
  listener.capture = false;
  dispose();
  button.click();
  button.dispatchEvent(new Event("customCase"));
  expect(calls).toEqual(["capture", "child", "once"]);
});

test("event option getters are captured once and malformed listener objects fail", () => {
  const container = document.createElement("main");
  let reads = 0;
  let element!: HTMLElement;
  const listener = {
    get capture() {
      reads++;
      return true;
    },
    handleEvent() {},
  };
  dispose = render(
    () => (element = h("div", { onClick: listener })),
    container,
  );
  expect(reads).toBe(1);
  dispose();
  expect(reads).toBe(1);
  expect(element).toBeDefined();
  for (const value of [1, true, "handler", {}, { handleEvent: 1 }]) {
    expect(() =>
      render(() => h("button", { onClick: value }), container),
    ).toThrow(TypeError);
  }
});

test("dynamic Show, For and Index mounts run after all nested batch DOM commits", () => {
  const container = document.createElement("main");
  document.body.append(container);
  const [shown, show] = createSignal(false),
    [rows, setRows] = createSignal<number[]>([]),
    [slots, setSlots] = createSignal<number[]>([]),
    [mounted, setMounted] = createSignal(0);
  const observations: boolean[] = [];
  const field = () => {
    const input = h("input");
    onMount(() => {
      observations.push(
        input.isConnected && container.querySelectorAll("input").length === 3,
      );
      input.focus();
      setMounted((count) => count + 1);
    });
    return input;
  };
  dispose = render(
    () =>
      h(
        "div",
        null,
        Show({ when: shown, children: field }),
        For({ each: rows, children: field }),
        Index({ each: slots, children: field }),
        h("output", null, mounted),
      ),
    container,
  );
  batch(() => {
    show(true);
    batch(() => {
      setRows([1]);
      setSlots([1]);
    });
    expect(observations).toEqual([]);
  });
  expect(observations).toEqual([true, true, true]);
  expect(container.querySelector("output")!.textContent).toBe("3");
  expect(document.activeElement).toBe(container.querySelectorAll("input")[2]);
});

test("native batch bridges external kernel writes and skips disposed queued mounts", () => {
  const container = document.createElement("main");
  document.body.append(container);
  const shown = kernelSignal(false);
  let mounts = 0;
  dispose = render(
    () =>
      Show({
        when: shown,
        children: () => {
          const input = h("input");
          onMount(() => {
            expect(input.isConnected).toBe(true);
            mounts++;
          });
          return input;
        },
      }),
    container,
  );
  batch(() => shown.set(true));
  expect(mounts).toBe(1);
  batch(() => {
    shown.set(false);
    shown.set(true);
    shown.set(false);
  });
  expect(mounts).toBe(1);
  expect(container.querySelector("input")).toBeNull();
});

test("mount-triggered writes drain later connected mounts synchronously", () => {
  const container = document.createElement("main");
  document.body.append(container);
  const [rows, setRows] = createSignal<number[]>([]);
  const mounted: number[] = [];
  dispose = render(
    () =>
      For({
        each: rows,
        children: (item) => {
          const node = h("span", null, item);
          onMount(() => {
            expect(node.isConnected).toBe(true);
            mounted.push(item);
            if (item === 1) setRows([1, 2]);
          });
          return node;
        },
      }),
    container,
  );
  setRows([1]);
  expect(mounted).toEqual([1, 2]);
  expect(container.textContent).toBe("12");
});

test("mount failures drain siblings and preserve the triggering batch error", () => {
  const container = document.createElement("main");
  const [rows, setRows] = createSignal<number[]>([]);
  const called: number[] = [];
  const mountFailure = new Error("mount"),
    batchFailure = new Error("batch");
  dispose = render(
    () =>
      For({
        each: rows,
        children: (item) => {
          onMount(() => {
            called.push(item);
            if (item % 2) throw mountFailure;
          });
          return h("span", null, item);
        },
      }),
    container,
  );
  expect(() => setRows([1, 2])).toThrow(mountFailure);
  expect(called).toEqual([1, 2]);
  expect(() =>
    batch(() => {
      setRows([3, 4]);
      throw batchFailure;
    }),
  ).toThrow(batchFailure);
  expect(called).toEqual([1, 2, 3, 4]);
});

test("HTML boolean falsy values and translate booleans preserve enumerated strings", () => {
  for (const value of [false, 0, -0, 0n, NaN, null, undefined]) {
    const element = h("button", {
      disabled: value,
      hidden: value,
    }) as HTMLButtonElement;
    expect(element.hasAttribute("disabled")).toBe(false);
    expect(element.hasAttribute("hidden")).toBe(false);
    const option = h("option", { selected: value }) as HTMLOptionElement;
    expect(option.selected).toBe(false);
  }
  for (const value of ["", "false"]) {
    const element = h("button", {
      disabled: value,
      hidden: value,
    }) as HTMLButtonElement;
    expect(element.disabled).toBe(true);
    expect(element.hidden).toBe(true);
  }
  for (const [value, expected] of [
    [true, "yes"],
    [false, "no"],
    [0, "0"],
    ["false", "false"],
  ] as const)
    expect(
      (h("div", { translate: value }) as Element).getAttribute("translate"),
    ).toBe(expected);
  expect(
    (h("svg", { translate: false, hidden: 0 }) as Element).getAttribute(
      "translate",
    ),
  ).toBe("false");
  expect((h("svg", { hidden: 0 }) as Element).getAttribute("hidden")).toBe("0");
});
