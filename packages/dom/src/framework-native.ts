import {
  serializeData,
  type Renderer,
  type Metadata,
  type DocumentMetadata,
  type RenderContext,
} from "@tschk/moonshine-framework";
import { h, defer, renderToString, escapeHtml, type SSRChild } from "./ssr";

type PageProps = {
  params: Record<string, string>;
  data: unknown;
  children?: SSRChild;
};
type Module = {
  default?: (props: PageProps) => SSRChild;
  metadata?: Metadata;
};

/** Bundled modules are the only source of components, including after relocation. */
export function createNativeRenderer(
  modules: Record<string, Module>,
  layoutsByRoute: Record<string, string[]> = {},
): Renderer {
  function component(key: string): (props: PageProps) => SSRChild {
    const value = Object.hasOwn(modules, key)
      ? modules[key]?.default
      : undefined;
    if (typeof value !== "function")
      throw new Error(`Missing native component: ${key}`);
    return value;
  }

  function document(context: RenderContext): string {
    const { route, params, data } = context;
    if (route.mode === "island")
      throw new Error("Native island hydration is not implemented");
    const layoutKeys = Object.hasOwn(layoutsByRoute, route.id)
      ? layoutsByRoute[route.id]!
      : (route.layouts ?? []);
    const pageKey = Object.hasOwn(modules, route.id) ? route.id : route.file;
    const metadata: DocumentMetadata = { lang: "en" };
    for (const key of [...layoutKeys, pageKey]) {
      const mod = Object.hasOwn(modules, key) ? modules[key] : undefined;
      const source =
        mod && Object.hasOwn(mod, "metadata") ? mod.metadata : undefined;
      if (source === undefined) continue;
      const value = typeof source === "function" ? source(context) : source;
      if (value && typeof value === "object" && "then" in value) {
        try {
          if (typeof (value as { then?: unknown }).then === "function")
            void Promise.resolve(value).catch(() => {});
        } catch {
          // A throwing then getter is invalid metadata too.
        }
        throw new TypeError(
          `Native metadata must be a synchronous object: ${key}`,
        );
      }
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(
          `Native metadata must be a synchronous object: ${key}`,
        );
      for (const field of ["title", "description", "lang"] as const) {
        if (!Object.hasOwn(value, field)) continue;
        const entry = value[field];
        if (entry === undefined) continue;
        if (entry !== null && typeof entry !== "string")
          throw new TypeError(`Invalid native metadata ${field}: ${key}`);
        metadata[field] = entry;
      }
    }
    let body: string;
    let scripts = "";
    if (route.mode === "spa") {
      if (!route.clientEntries.length)
        throw new Error("Native SPA route requires a client entry");
      body = renderToString(() =>
        h("div", { id: "moonshine-app", "data-moonshine-app": route.id }),
      );
      scripts = `<script type="application/json" data-moonshine-props>${serializeData({ params, data })}</script>`;
      for (const entry of route.clientEntries) {
        scripts += `<script type="module" src="${escapeHtml(entry)}"></script>`;
      }
    } else {
      const Page = component(pageKey);
      const layouts = layoutKeys.map(component);
      body = renderToString(() => {
        let child: () => SSRChild = () => h(Page, { params, data });
        for (let index = layouts.length - 1; index >= 0; index--) {
          const Layout = layouts[index]!;
          const children = child;
          child = () => h(Layout, { params, data, children: defer(children) });
        }
        return child();
      });
    }
    const styles = (route.clientStyles ?? [])
      .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
      .join("");
    const lang =
      metadata.lang == null ? "" : ` lang="${escapeHtml(metadata.lang)}"`;
    const head =
      (metadata.title == null
        ? ""
        : `<title>${escapeHtml(metadata.title)}</title>`) +
      (metadata.description == null
        ? ""
        : `<meta name="description" content="${escapeHtml(metadata.description)}">`);
    return `<!doctype html><html${lang}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}${styles}</head><body>${body}${scripts}</body></html>`;
  }

  return {
    name: "native",
    async prerender(context) {
      return context.route.mode === "api"
        ? JSON.stringify(context.data)
        : document(context);
    },
    async render(context) {
      const api = context.route.mode === "api";
      return new Response(
        api ? JSON.stringify(context.data) : document(context),
        {
          headers: {
            "content-type": api
              ? "application/json; charset=utf-8"
              : "text/html; charset=utf-8",
          },
        },
      );
    },
  };
}
