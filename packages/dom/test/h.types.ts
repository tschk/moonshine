import { h, hNS } from "../src/dom";
import { h as serverH, hSource } from "../src/ssr";

interface Props {
  readonly label: string;
}
declare const props: Props;
const Component = (value: Props) => value.label;
h(Component, props);
serverH(Component, props);
// @ts-expect-error Component props retain their declared value type.
h(Component, { label: 1 });
// @ts-expect-error Server component props retain their declared value type.
serverH(Component, { label: 1 });

const HTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";
const title: SVGTitleElement = hNS(SVG, "title");
const anchor: HTMLAnchorElement = hNS(HTML, "a");
// @ts-expect-error A lexical SVG title is not an HTML title.
const wrongTitle: HTMLTitleElement = hNS(SVG, "title");
// @ts-expect-error A lexical HTML anchor is not an SVG anchor.
const wrongAnchor: SVGAElement = hNS(HTML, "a");
void [title, anchor, wrongTitle, wrongAnchor];

hSource("div", { title: () => "source" }, () => "child");
// @ts-expect-error Compiler source factory accepts intrinsic tags only.
hSource(Component, props);
// @ts-expect-error Source children use the existing SSR child contract.
hSource("div", null, { arbitrary: true });
