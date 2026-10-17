import { createDynamic, Dynamic } from "../src/dynamic";
import { Dynamic as ServerDynamic, h as serverH } from "../src/ssr";
import { h } from "../src/dom";
const Component = (props: { label: string; count?: number }) =>
  h("p", null, props.label);
createDynamic(() => Component, { label: "one" });
Dynamic({ component: Component, label: "one", count: 2 });
Dynamic({ component: "button", disabled: true, "aria-label": "close" });
ServerDynamic({
  component: (props: { label: string }) => serverH("p", null, props.label),
  label: "server",
});
// @ts-expect-error component props remain required
Dynamic({ component: Component });
// @ts-expect-error component prop types remain checked
createDynamic(() => Component, { label: 1 });
// @ts-expect-error component prop names remain checked
Dynamic({ component: Component, label: "one", missing: true });
