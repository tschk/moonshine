import {
  createElement,
  type ComponentType,
  type FunctionComponent,
  type ReactNode,
} from "react";
import { renderToReadableStream } from "react-dom/server";
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

async function loadComponent(file: string): Promise<ComponentType<unknown>> {
  const registered = routeModules.get(file);
  const mod = registered ?? (await import(file));
  return ((mod as { default?: unknown }).default ??
    mod) as ComponentType<unknown>;
}

async function buildBody(
  context: RenderContext,
  registry: IslandRegistry,
): Promise<ReactNode> {
  const { route, params, data } = context;
  const Page = (await loadComponent(
    route.file,
  )) as FunctionComponent<PageProps>;
  const pageProps = { params, data };
  let body = createElement(Page, pageProps);

  if (route.layouts) {
    for (let i = route.layouts.length - 1; i >= 0; i--) {
      const Layout = (await loadComponent(
        route.layouts[i]!,
      )) as FunctionComponent<LayoutProps>;
      body = createElement(Layout, { ...pageProps, children: body });
    }
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
    preloads.add(escapeHtml(entry.specifier));
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

async function renderPage(context: RenderContext): Promise<string> {
  const registry: IslandRegistry = { entries: new Map() };
  const body = await buildBody(context, registry);
  const bodyMarkup = await renderToStringAsync(body, context.signal);
  const isIslandMode = context.route.mode === "island";
  const { head, tail } = buildIslandHeadAndTail(
    registry,
    context.route.clientEntries,
    isIslandMode,
  );
  return `<!DOCTYPE html><html><head>${head}</head><body>${bodyMarkup}${tail}</body></html>`;
}

function renderSpaShell(context: RenderContext): string {
  const clientEntries = context.route.clientEntries;
  const head: string[] = [];
  const tail: string[] = [];
  for (const entry of clientEntries) {
    head.push(`<link rel="modulepreload" href="${escapeHtml(entry)}">`);
    tail.push(`<script type="module" src="${escapeHtml(entry)}"></script>`);
  }
  return `<!DOCTYPE html><html><head>${head.join("")}</head><body><div id="moonshine-app" data-moonshine-app="${escapeHtml(context.route.id)}"></div>${tail.join("")}</body></html>`;
}

export const reactRenderer: Renderer = {
  name: "react",
  async prerender(context) {
    if (context.route.mode === "api") {
      return serializeIslandProps(context.data);
    }
    if (context.route.mode === "spa") {
      return renderSpaShell(context);
    }
    return renderPage(context);
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
    const html = await renderPage(context);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
