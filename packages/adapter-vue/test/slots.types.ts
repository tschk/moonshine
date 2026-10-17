import {
  withDefaultSlot,
  createDOMSlotOutlet,
  createServerSlotOutlet,
} from "@tschk/moonshine-vue/slots";
import type { DOMChild } from "@tschk/moonshine-dom";
import type { SSRChild } from "@tschk/moonshine-dom/ssr";
const Child = (props: { label: string; count: number }): DOMChild =>
  props.label + props.count;
const Wrapped = withDefaultSlot(Child, () => "slot");
Wrapped({ label: "okay", count: 1 });
// @ts-expect-error The wrapper preserves required child props.
Wrapped({ label: "missing" });
// @ts-expect-error The wrapper does not widen declared prop types.
Wrapped({ label: "wrong", count: "one" });
const DOMOutlet = createDOMSlotOutlet({});
const dom: DOMChild = DOMOutlet(() => "fallback");
const SSROutlet = createServerSlotOutlet({});
const ssr: SSRChild = SSROutlet(() => "fallback");
void [dom, ssr];
// @ts-expect-error Only callable component setup functions are supported.
withDefaultSlot({ render() {} }, () => "slot");
