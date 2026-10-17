import type { RenderContext, Renderer } from "@tschk/moonshine-framework";
import { escapeHtml } from "@tschk/moonshine-dom/ssr";
import type { DOMChild } from "@tschk/moonshine-dom/dom";

async function prerender(context: RenderContext): Promise<string> {
  const { sourceRenderer } =
    await import("@tschk/moonshine-dom/framework-source");
  const html = await sourceRenderer.prerender(context);
  return context.route.mode === "api"
    ? html
    : html.replace(
        "<body>",
        `<body data-moonshine-mode="${escapeHtml(context.route.mode)}">`,
      );
}

/** Compatibility name for the independent, buffered server renderer. */
export const solidRenderer: Renderer = {
  name: "solid",
  prerender,
  async render(context) {
    return new Response(await prerender(context), {
      headers: {
        "content-type":
          context.route.mode === "api"
            ? "application/json; charset=utf-8"
            : "text/html; charset=utf-8",
      },
    });
  },
};

export function hydrateSolid<T>(
  _Component: (props: T) => DOMChild,
  _props: T,
  _container: Element,
): never {
  throw new Error(
    "Solid hydration is not implemented; compile with Crepus and use native render for a fresh mount",
  );
}
