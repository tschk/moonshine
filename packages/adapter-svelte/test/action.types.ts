import type { Action, ActionReturn } from "../src/directives";
interface Attrs {
  onchange?: (event: CustomEvent<number>) => void;
}
const parameterized: Action<HTMLDivElement, number, Attrs> = (node, value) => ({
  update(next) {
    node.dataset.next = String(next + value);
  },
});
const div = document.createElement("div");
parameterized(div, 1);
// @ts-expect-error parameter is required
parameterized(div);
// @ts-expect-error parameter payload remains number
parameterized(div, "one");
// @ts-expect-error element type is retained
parameterized(document.createElement("span"), 1);
const optional: Action<HTMLDivElement> = (node) => {
  node.dataset.started = "yes";
};
optional(div);
const result: ActionReturn<number, Attrs> = {
  update(value) {
    void (value + 1);
  },
  $$_attributes: {
    onchange(event) {
      void event.detail;
    },
  },
};
void result;
