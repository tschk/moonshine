import { createElement, type FunctionComponent } from "react";
import { renderToReadableStream } from "react-dom/server";
import type { RenderContext, Renderer } from "@tschk/moonshine-framework";
import { STYLES } from "./styles";

/**
 * `reactRenderer` from `@tschk/moonshine-react` emits a fixed document shell
 * with an empty `<head>`: no charset, no viewport, no title, no way to attach
 * a stylesheet. The `Renderer` contract is four lines, so the site implements
 * it directly and keeps the head under its own control.
 */

export type PageMeta = {
  title: string;
  description: string;
};

export type PageData = {
  meta: PageMeta;
  [key: string]: unknown;
};

type PageComponent = FunctionComponent<{
  params: Record<string, string>;
  data: PageData;
}>;

export type SiteModules = Record<string, { default?: unknown } | undefined>;

const CANONICAL_ORIGIN = "https://moonshine.tsc.hk";

const FALLBACK_META: PageMeta = {
  title: "moonshine",
  description:
    "A hyperminimal Bun-first UI runtime built around a signal-only kernel.",
};

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderBodyMarkup(
  element: ReturnType<typeof createElement>,
  signal: AbortSignal,
): Promise<string> {
  const stream = await renderToReadableStream(element, { signal });
  await stream.allReady;
  return new Response(stream).text();
}

function documentShell(options: {
  meta: PageMeta;
  canonical: string;
  body: string;
  hydrate: boolean;
}): string {
  const title = escapeAttribute(options.meta.title);
  const description = escapeAttribute(options.meta.description);
  const client = options.hydrate
    ? `<script type="module" src="/client.js"></script>`
    : "";
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${escapeAttribute(options.canonical)}">`,
    '<meta name="color-scheme" content="dark">',
    '<meta name="theme-color" content="#09090b">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap">',
    `<style>${STYLES}</style>`,
    "</head>",
    "<body>",
    options.body,
    client,
    "</body>",
    "</html>",
  ].join("");
}

function readMeta(data: unknown): PageMeta {
  const meta = (data as PageData | undefined)?.meta;
  return meta && typeof meta.title === "string" ? meta : FALLBACK_META;
}

/**
 * Cloudflare Workers cannot resolve the `await import(absolutePath)` a renderer
 * would otherwise use, so the compiler's static module map is handed in here
 * and the page component is read out of it by route id.
 */
export function createSiteRenderer(modules: SiteModules): Renderer {
  function pageComponent(id: string, file: string): PageComponent {
    const mod = modules[id] ?? modules[file];
    const component = mod?.default;
    if (typeof component !== "function") {
      throw new Error(`No page component registered for route "${id}"`);
    }
    return component as PageComponent;
  }

  async function renderHtml(context: RenderContext): Promise<string> {
    const { route, params, data, request } = context;
    const Page = pageComponent(route.id, route.file);
    // The pipeline keys loader results by module key; pages want the value.
    const record = data as Record<string, unknown> | undefined;
    const pageData = (record?.[route.id] ?? record ?? {}) as PageData;
    const body = await renderBodyMarkup(
      createElement(Page, { params, data: pageData }),
      context.signal,
    );
    return documentShell({
      meta: readMeta(pageData),
      canonical: CANONICAL_ORIGIN + new URL(request.url).pathname,
      body,
      hydrate: true,
    });
  }

  return {
    name: "moonshine-site",
    async prerender(context) {
      return renderHtml(context);
    },
    async render(context) {
      const html = await renderHtml(context);
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    },
  };
}
