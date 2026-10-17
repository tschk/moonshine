import { createApp, type NativeApplication } from "../src/app";
import { h } from "@tschk/moonshine-dom/dom";
const Component = (props: { id: string; count?: number }) =>
  h("p", {}, props.id);
const app: NativeApplication = createApp(Component, { id: "one" });
const mounted: void = app.mount("#app");
app.unmount();
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
// @ts-expect-error mount does not return a Vue public instance
const instance: { count: number } = app.mount(document.createElement("main"));
void [mounted, instance];

interface InterfaceProps {
  id: string;
  count?: number;
}
const interfaceProps: InterfaceProps = { id: "interface" };
createApp((props: InterfaceProps) => h("p", {}, props.id), interfaceProps);
