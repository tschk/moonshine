import { h } from "@tschk/moonshine-dom/ssr";

export default function Home(props: { data?: { title?: string } }) {
  return h("h1", null, props.data?.title ?? "Home");
}
