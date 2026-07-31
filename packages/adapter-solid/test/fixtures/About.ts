import { escape, ssr } from "solid-js/web";

export default function About(props: { params?: { name?: string } }) {
  return ssr(
    ["<p>Hello ", "</p>"],
    escape(String(props.params?.name ?? "world")),
  );
}
