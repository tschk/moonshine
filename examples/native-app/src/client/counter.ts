import { h } from "@tschk/moonshine-dom/dom";
import { createSignal } from "@tschk/moonshine-dom/reactive";

export default function Counter(props: {
  data: { counter: { start: number } };
}) {
  const [count, setCount] = createSignal(props.data.counter.start);
  const [choice, setChoice] = createSignal("b");
  return h(
    "main",
    null,
    h("a", { href: "/" }, "home"),
    h("h1", null, "native counter"),
    h(
      "button",
      { type: "button", onClick: () => setCount(count() + 1) },
      () => `count ${count()}`,
    ),
    h(
      "p",
      null,
      h("label", { htmlFor: "choice" }, "choice "),
      h(
        "select",
        {
          id: "choice",
          value: "b",
          onChange: (event: Event) =>
            setChoice((event.currentTarget as HTMLSelectElement).value),
        },
        h("option", { value: "a" }, "first"),
        h("option", { value: "b" }, "second"),
      ),
    ),
    h("output", { htmlFor: "choice" }, () => `selected ${choice()}`),
  );
}
