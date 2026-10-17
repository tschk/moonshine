import { h, hNS, hSourceNS } from "../src/dom";
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
const math: MathMLElement = hNS("http://www.w3.org/1998/Math/MathML", "math");
const custom: Element = hNS("urn:custom", "x-y");
// @ts-expect-error Custom namespace strings return generic Element.
const wrongCustom: HTMLElement = hNS("urn:custom", "x-y");
void [math, custom, wrongCustom];
void [title, anchor, wrongTitle, wrongAnchor];
const sourceEl: Element = hSourceNS(undefined as unknown, "x-y");
const sourceNull: Element = hSourceNS(null, "x-y", null, "text");
void [sourceEl, sourceNull];

hSource("div", { title: () => "source" }, () => "child");
// @ts-expect-error Compiler source factory accepts intrinsic tags only.
hSource(Component, props);
// @ts-expect-error Source children use the existing SSR child contract.
hSource("div", null, { arbitrary: true });
