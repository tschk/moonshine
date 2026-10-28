import {
  createElement,
  type ComponentType,
  type FunctionComponent,
  type ReactNode,
} from "react";
// The web-streams build runs unchanged on Bun, Node, Workers and Vercel; the
// default `react-dom/server` entry resolves per bundle target, and its Node
// build lacks renderToReadableStream before React 19.2.
import { renderToReadableStream } from "react-dom/server.edge";
import type { RenderContext, Renderer } from "@tschk/moonshine-framework";
import { IslandProvider, type IslandRegistry } from "./islands";
import { escapeHtml, serializeIslandProps } from "./serialize";

async function renderToStringAsync(
  element: ReactNode,
  signal?: AbortSignal,
): Promise<string> {
  const stream = await renderToReadableStream(element, { signal });
  await stream.allReady;
  const res = new Response(stream);
  return res.text();
}

type PageProps = {
  params: Record<string, string>;
  data: unknown;
};

type LayoutProps = PageProps & {
  children?: ReactNode;
};

const routeModules = new Map<string, unknown>();

/**
 * Supplies statically bundled route modules. Runtimes that cannot resolve a
 * dynamic `import(file)` — Cloudflare Workers most notably — register the map
 * their build already produced instead.
 */
export function registerRouteModules(modules: Record<string, unknown>): void {
  for (const [key, mod] of Object.entries(modules)) routeModules.set(key, mod);
}

function componentOf(mod: unknown): ComponentType<unknown> {
  return ((mod as { default?: unknown }).default ??
    mod) as ComponentType<unknown>;
}

async function loadComponent(file: string): Promise<ComponentType<unknown>> {
  const registered = routeModules.get(file);
  return componentOf(registered ?? (await import(file)));
}

/** A route's page module and its layouts, outermost first. */
export type BundledRoute = { page: unknown; layouts: readonly unknown[] };

type RouteComponents = (route: RenderContext["route"]) => Promise<{
  page: ComponentType<unknown>;
  layouts: ComponentType<unknown>[];
}>;

/** Resolves components from the registered modules, else from source paths. */
const loadFromFiles: RouteComponents = async (route) => ({
  page: await loadComponent(route.file),
  layouts: await Promise.all((route.layouts ?? []).map(loadComponent)),
});

async function buildBody(
  context: RenderContext,
  registry: IslandRegistry,
  load: RouteComponents,
): Promise<ReactNode> {
  const { route, params, data } = context;
  const components = await load(route);
  const Page = components.page as FunctionComponent<PageProps>;
  const pageProps = { params, data };
  let body = createElement(Page, pageProps);

  for (let i = components.layouts.length - 1; i >= 0; i--) {
    const Layout = components.layouts[i] as FunctionComponent<LayoutProps>;
    body = createElement(Layout, { ...pageProps, children: body });
  }

  return createElement(IslandProvider, { registry }, body);
}

function buildIslandHeadAndTail(
  registry: IslandRegistry,
  clientEntries: string[],
  isIslandMode: boolean,
): { head: string; tail: string } {
  const preloads = new Set<string>();
  const modules: Record<string, string> = {};

  for (const entry of registry.entries.values()) {
    if (entry.hydrate !== "idle" && entry.hydrate !== "visible") {
      preloads.add(escapeHtml(entry.specifier));
    }
    modules[entry.id] = entry.specifier;
  }

  const headParts: string[] = [];
  for (const href of preloads) {
    headParts.push(`<link rel="modulepreload" href="${href}">`);
  }

  const tailParts: string[] = [];
  if (isIslandMode && registry.entries.size > 0) {
    for (const entry of clientEntries) {
      preloads.add(escapeHtml(entry));
      headParts.push(`<link rel="modulepreload" href="${escapeHtml(entry)}">`);
    }
    tailParts.push(
      `<script type="application/json" data-moonshine-island-modules>${serializeIslandProps(modules)}</script>`,
    );
    for (const entry of clientEntries) {
      tailParts.push(
        `<script type="module" src="${escapeHtml(entry)}"></script>`,
      );
    }
  }

  return { head: headParts.join(""), tail: tailParts.join("") };
}

/** Document shell matching crepuscularity CLI `assets/web/index.html`. */
const DOCUMENT_HEAD =
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{scroll-behavior:smooth}html,body{margin:0}body{min-height:100vh}</style>';

async function renderPage(
  context: RenderContext,
  load: RouteComponents,
): Promise<string> {
  const registry: IslandRegistry = { entries: new Map() };
  const body = await buildBody(context, registry, load);
  const bodyMarkup = await renderToStringAsync(body, context.signal);
  const isIslandMode = context.route.mode === "island";
  const { head, tail } = buildIslandHeadAndTail(
    registry,
    context.route.clientEntries,
    isIslandMode,
  );
  const headParts = `${stylesheets(context)}${head}`;
  const document = completeDocument(bodyMarkup, headParts, tail);
  if (document) return document;
  return `<!DOCTYPE html><html lang="en"><head>${DOCUMENT_HEAD}${headParts}</head><body>${bodyMarkup}${tail}</body></html>`;
}

/**
 * A root layout may render the whole document (`<html>`, `<head>`, `<body>`),
 * as Next.js and Waku layouts do. React then owns <head> and hoists every
 * `<title>`, `<meta>` and `<link>` rendered anywhere in the tree into it; the
 * renderer only adds its stylesheets and scripts. Returns undefined when the
 * markup is not a document.
 */
function completeDocument(
  markup: string,
  head: string,
  tail: string,
): string | undefined {
  const doctype = "<!DOCTYPE html>";
  const html = markup.startsWith(doctype)
    ? markup.slice(doctype.length)
    : markup;
  if (!/^<html[\s>]/.test(html)) return undefined;
  const charset = /<meta charSet=/i.test(html) ? "" : '<meta charset="utf-8">';
  const withHead = html.includes("</head>")
    ? html
        .replace("</head>", `${head}</head>`)
        .replace("<head>", `<head>${charset}`)
    : html.replace(
        /^<html[^>]*>/,
        (open) => `${open}<head>${charset}${head}</head>`,
      );
  const end = withHead.lastIndexOf("</body>");
  return (
    doctype +
    (end === -1
      ? withHead.replace(/<\/html>$/, `${tail}</html>`)
      : `${withHead.slice(0, end)}${tail}${withHead.slice(end)}`)
  );
}

/** The route's published CSS, collected by `moonshine build`. */
function stylesheets(context: RenderContext): string {
  return (context.route.clientStyles ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("");
}

function renderSpaShell(context: RenderContext): string {
  const clientEntries = context.route.clientEntries;
  const head: string[] = [stylesheets(context)];
  const tail: string[] = [];
  for (const entry of clientEntries) {
    head.push(`<link rel="modulepreload" href="${escapeHtml(entry)}">`);
    tail.push(`<script type="module" src="${escapeHtml(entry)}"></script>`);
  }
  return `<!DOCTYPE html><html lang="en"><head>${DOCUMENT_HEAD}${head.join("")}</head><body><div id="moonshine-app" data-moonshine-app="${escapeHtml(context.route.id)}"></div>${tail.join("")}</body></html>`;
}

function createRenderer(load: RouteComponents): Renderer {
  return {
    name: "react",
    async prerender(context) {
      if (context.route.mode === "api") {
        return serializeIslandProps(context.data);
      }
      if (context.route.mode === "spa") {
        return renderSpaShell(context);
      }
      return renderPage(context, load);
    },
    async render(context) {
      if (context.route.mode === "api") {
        return new Response(serializeIslandProps(context.data), {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      if (context.route.mode === "spa") {
        return new Response(renderSpaShell(context), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      const html = await renderPage(context, load);
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };
}

/**
 * Renders route modules registered with `registerRouteModules`, falling back
 * to importing each route's source file.
 */
export const reactRenderer: Renderer = createRenderer(loadFromFiles);

/**
 * A renderer bound to the route modules of one server bundle, keyed by route
 * id. `moonshine build` exports it from the bundle, so pages, layouts and
 * react-dom/server share that bundle's single React instance and its CSS
 * module class names, wherever the bundle is deployed. Routes missing from
 * the map fall back to `reactRenderer`'s lookup.
 */
export function createReactRenderer(
  routes: Readonly<Record<string, BundledRoute>>,
): Renderer {
  return createRenderer(async (route) => {
    const bundled = Object.hasOwn(routes, route.id)
      ? routes[route.id]
      : undefined;
    if (!bundled) return loadFromFiles(route);
    return {
      page: componentOf(bundled.page),
      layouts: bundled.layouts.map(componentOf),
    };
  });
}
