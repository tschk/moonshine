import { h, Portal } from "../src/portal";
import { render } from "../src/dom";
import {
  h as serverH,
  Portal as ServerPortal,
  type SSRChild,
} from "../src/ssr";

const button: HTMLButtonElement = h("button", {}, "close");
const svg: SVGSVGElement = h("svg", {});
declare const shadow: ShadowRoot;
render(() => button, shadow);
h(Portal, { mount: svg, isSVG: true, children: button });
const server: SSRChild = serverH(ServerPortal, {
  get children() {
    return serverH("b", null, "unread");
  },
});
// @ts-expect-error the opt-in factory preserves native element overloads
const input: HTMLInputElement = h("button", {});
void server;
void input;

interface ComponentProps {
  readonly label: string;
}
declare const componentProps: ComponentProps;
const Component = (props: ComponentProps) => props.label;
h(Component, componentProps);
// @ts-expect-error Component props retain their declared value type.
h(Component, { label: 1 });
