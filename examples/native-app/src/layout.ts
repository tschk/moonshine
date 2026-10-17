import type { DocumentMetadata } from "@tschk/moonshine-framework";
import { h, type SSRChild } from "@tschk/moonshine-dom/ssr";

export const metadata = {
  title: "moonshine native",
  description: "Independent Moonshine server and browser rendering.",
  lang: "en",
} satisfies DocumentMetadata;

export function loader() {
  return { title: "moonshine native" };
}

export const before = [
  async (_context: unknown, next: () => Promise<Response>) => {
    const response = await next();
    response.headers.set("x-native-layout", "yes");
    return response;
  },
];

export default function Layout(props: {
  children?: SSRChild;
  data: Record<string, unknown>;
}) {
  const layout = props.data["src/layout.ts"] as ReturnType<typeof loader>;
  return h(
    "main",
    null,
    h(
      "header",
      null,
      h("p", null, layout.title),
      h(
        "nav",
        { "aria-label": "Main" },
        h("a", { href: "/" }, "home"),
        " · ",
        h("a", { href: "/about" }, "about"),
        " · ",
        h("a", { href: "/counter" }, "counter"),
      ),
    ),
    props.children,
  );
}
