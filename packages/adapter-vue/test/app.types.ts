import {
  createApp,
  type ComponentExports,
  type ComponentProps,
  type ComponentView,
  type NativeApplication,
  type ShallowUnwrap,
} from "../src/app";
import { ref, shallowRef, type Ref } from "../src/reactive";
import { h, type DOMChild } from "@tschk/moonshine-dom/dom";
const Component = (props: { id: string; count?: number }) =>
  h("p", {}, props.id);
const app: NativeApplication = createApp(Component, { id: "one" });
const mounted: object = app.mount("#app");
app.unmount();

type BrandedExposed = ShallowUnwrap<{
  count: Ref<number>;
  increment: () => void;
}>;
const BrandedComponent = (props: {
  id: string;
}): ComponentView<DOMChild, BrandedExposed, { id: string }> =>
  h("p", {}, props.id);
const brandedApp: NativeApplication<{
  count: number;
  increment: () => void;
}> = createApp(BrandedComponent, { id: "branded" });
const brandedInstance: { count: number; increment: () => void } =
  brandedApp.mount("#app");
const brandedProps: ComponentProps<typeof BrandedComponent> = { id: "props" };
const childRef = shallowRef<ComponentExports<typeof BrandedComponent> | null>(
  null,
);
const inputRef = ref<HTMLInputElement | null>(null);
const inputFocus: ((options?: FocusOptions) => void) | undefined =
  inputRef.value?.focus;
const unbrandedExports: [ComponentExports<typeof Component>] = [neverValue()];
function neverValue(): never {
  throw new Error("unreachable");
}

// @ts-expect-error required original prop remains required
createApp(Component, {});
// @ts-expect-error source prop types do not widen
createApp(Component, { id: 1 });
// @ts-expect-error props are explicitly supplied for a native root
createApp(Component);
// @ts-expect-error no Vue Options object contract
createApp({ setup: () => () => h("p") }, {});
// @ts-expect-error asynchronous roots cannot produce DOM children
createApp(async () => h("p"), {});
// @ts-expect-error unbranded mount does not invent a typed public instance
const instance: { count: number } = app.mount(document.createElement("main"));
// @ts-expect-error branded mount preserves exact exposed property types
const wrongBranded: { count: string } = brandedApp.mount(
  document.createElement("main"),
);
void [
  mounted,
  brandedInstance,
  brandedProps,
  childRef,
  inputFocus,
  unbrandedExports,
  instance,
  wrongBranded,
];

interface InterfaceProps {
  id: string;
  count?: number;
}
const interfaceProps: InterfaceProps = { id: "interface" };
createApp((props: InterfaceProps) => h("p", {}, props.id), interfaceProps);
