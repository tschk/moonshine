import type {
  DocumentMetadata,
  RenderContext,
} from "@tschk/moonshine-framework";
import { h } from "@tschk/moonshine-dom/ssr";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST")
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD, POST" },
    });
  const name = (await request.formData()).get("name");
  if (typeof name !== "string" || !name.trim() || name.length > 80)
    return new Response("Enter a name between 1 and 80 characters", {
      status: 400,
    });
  return new Response(null, {
    status: 303,
    headers: { location: `/?name=${encodeURIComponent(name.trim())}` },
  });
}

export function loader({ request }: { request: Request }) {
  return {
    name: new URL(request.url).searchParams.get("name") ?? "world",
    serverOnlyMarker: "NATIVE_SERVER_ONLY_MARKER",
  };
}

export function metadata({ data }: RenderContext): DocumentMetadata {
  const { home } = data as { home: ReturnType<typeof loader> };
  return { title: `hello, ${home.name}` };
}

export default function Home(props: {
  data: { home: ReturnType<typeof loader> };
}) {
  return h(
    "section",
    null,
    h("h1", null, "hello, ", props.data.home.name),
    h("img", {
      src: "/logo.svg",
      alt: "Public asset example",
      width: 24,
      height: 24,
    }),
    h(
      "p",
      null,
      "This page uses the native server renderer. Query text is escaped.",
    ),
    h("a", { href: "/counter" }, "open counter"),
    h(
      "form",
      { method: "post", action: "/" },
      h("label", { htmlFor: "name" }, "name"),
      h("input", {
        id: "name",
        name: "name",
        required: true,
        maxLength: 80,
        value: props.data.home.name,
      }),
      h("button", { type: "submit" }, "greet"),
    ),
  );
}
