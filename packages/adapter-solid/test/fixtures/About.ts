import { h } from "@tschk/moonshine-dom/ssr";

export default function About(props: { params?: { name?: string } }) {
  return h("p", null, "Hello ", props.params?.name ?? "world");
}
