import { ssr } from "solid-js/web";

export default function Layout(props: { children: { t: string } }) {
  return ssr(["<main>", "</main>"], props.children);
}
