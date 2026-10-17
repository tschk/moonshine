import { h, type SSRChild } from "@tschk/moonshine-dom/ssr";

export default function Layout(props: { children: SSRChild }) {
  return h("main", null, props.children);
}
