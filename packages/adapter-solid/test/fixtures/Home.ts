import { escape, ssr } from "solid-js/web";

export default function Home(props: { data?: { title?: string } }) {
  return ssr(["<h1>", "</h1>"], escape(String(props.data?.title ?? "Home")));
}
