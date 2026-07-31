import type { RenderContext, Renderer } from "@tschk/moonshine-framework";
import type { JSX } from "solid-js";
import {
  createComponent,
  escape,
  hydrate as solidHydrate,
  isServer,
  renderToStream,
  renderToStringAsync,
  ssr,
} from "solid-js/web";

type SsrNode = ReturnType<typeof ssr>;

type PageProps = {
  params: Record<string, string>;
  data: unknown;
};

async function loadComponent(
  file: string,
): Promise<(props: unknown) => SsrNode> {
  const mod = await import(file);
  return (mod.default ?? mod) as (props: unknown) => SsrNode;
}

function escapeAttr(value: string): string {
  return (escape as (s: string, attr: boolean) => string)(value, true);
}

function Shell(props: { mode: string; children: SsrNode }): SsrNode {
  return ssr(
    ["<!DOCTYPE html><html><head></head>", "</html>"],
    ssr(
      ['<body data-moonshine-mode="', '">', "</body>"],
      escapeAttr(props.mode),
      props.children,
    ),
  );
}

async function buildBody(context: RenderContext): Promise<SsrNode> {
  const Page = await loadComponent(context.route.file);
  const pageProps: PageProps = { params: context.params, data: context.data };
  let body = Page(pageProps);
  if (context.route.layouts) {
    for (let i = context.route.layouts.length - 1; i >= 0; i--) {
      const Layout = await loadComponent(context.route.layouts[i]!);
      body = Layout({ ...pageProps, children: body });
    }
  }
  return Shell({ mode: context.route.mode, children: body });
}

function buildSpaShell(context: RenderContext): SsrNode {
  const clientTags = context.route.clientEntries
    .map((href) => `<script type="module" src="${escapeAttr(href)}"></script>`)
    .join("");
  const body = ssr(
    [
      '<body data-moonshine-mode="',
      '"><div id="moonshine-app" data-moonshine-app="',
      '"></div>',
      "</body>",
    ],
    escapeAttr(context.route.mode),
    escapeAttr(context.route.id),
    clientTags,
  );
  return ssr(
    ["<!DOCTYPE html><html><head>", "</head>", "</html>"],
    clientTags,
    body,
  );
}

async function renderPageToString(context: RenderContext): Promise<string> {
  const body = await buildBody(context);
  return renderToStringAsync(() => body);
}

async function renderPage(context: RenderContext): Promise<Response> {
  const body = await buildBody(context);
  const { readable, writable } = new TransformStream();
  const stream = renderToStream(() => body);
  stream.pipeTo(writable);
  return new Response(readable, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const solidRenderer: Renderer = {
  name: "solid",
  async prerender(context) {
    if (context.route.mode === "api") return JSON.stringify(context.data);
    if (context.route.mode === "spa") {
      return renderToStringAsync(() => buildSpaShell(context));
    }
    return renderPageToString(context);
  },
  async render(context) {
    if (context.route.mode === "api") {
      return new Response(JSON.stringify(context.data), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (context.route.mode === "spa") {
      const html = await renderToStringAsync(() => buildSpaShell(context));
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return renderPage(context);
  },
};

export function hydrateSolid<T>(
  Component: (props: T) => JSX.Element,
  props: T,
  container: Element,
): (() => void) | undefined {
  if (isServer) return;
  return solidHydrate(() => createComponent(Component, props), container);
}
