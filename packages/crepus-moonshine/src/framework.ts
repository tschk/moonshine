import { createElement, type ReactElement } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import type { RenderContext, Renderer } from "@tschk/moonshine-framework";
import { parseCrepus, IR_VERSION, type ViewIr } from "@tschk/crepus-wasm";
import { renderCrepusIr } from "./render";

const EMPTY_IR: ViewIr = { version: IR_VERSION, root: [] };

/**
 * Route data may be `.crepus` source or already-parsed View IR. Source is
 * parsed by the Rust parser via WASM.
 */
function getCrepusIr(context: RenderContext): ViewIr {
  const data = context.data;
  if (typeof data === "string") {
    return data.trim().length > 0 ? parseCrepus(data) : EMPTY_IR;
  }
  if (
    data &&
    typeof data === "object" &&
    "root" in data &&
    Array.isArray((data as ViewIr).root)
  ) {
    return data as ViewIr;
  }
  return EMPTY_IR;
}

function buildRoot(context: RenderContext, body: ReactElement): ReactElement {
  const preloads = context.route.clientEntries.map((href) =>
    createElement("link", { rel: "modulepreload", href, key: href }),
  );
  const scripts = context.route.clientEntries.map((href) =>
    createElement("script", { type: "module", src: href, key: href }),
  );
  return createElement(
    "html",
    null,
    createElement("head", null, ...preloads, ...scripts),
    createElement(
      "body",
      {
        "data-moonshine-mode": context.route.mode,
        "data-moonshine-app": context.route.id,
      },
      body,
    ),
  );
}

async function renderReactToStringAsync(
  element: ReactElement,
  signal?: AbortSignal,
): Promise<string> {
  const stream = await renderToReadableStream(element, { signal });
  await stream.allReady;
  const res = new Response(stream);
  return res.text();
}

export const crepusRenderer: Renderer = {
  name: "crepus",
  async prerender(context) {
    if (context.route.mode === "api") return JSON.stringify(context.data);
    if (context.route.mode === "spa") {
      const body = createElement("div", {
        id: "moonshine-app",
        "data-moonshine-app": context.route.id,
      });
      return `<!DOCTYPE html>${renderToStaticMarkup(buildRoot(context, body))}`;
    }
    const body = renderCrepusIr(getCrepusIr(context));
    return `<!DOCTYPE html>${renderToStaticMarkup(buildRoot(context, body))}`;
  },
  async render(context) {
    if (context.route.mode === "api") {
      return new Response(JSON.stringify(context.data), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (context.route.mode === "spa") {
      const body = createElement("div", {
        id: "moonshine-app",
        "data-moonshine-app": context.route.id,
      });
      const html = `<!DOCTYPE html>${renderToStaticMarkup(buildRoot(context, body))}`;
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const body = renderCrepusIr(getCrepusIr(context));
    const html = `<!DOCTYPE html>${await renderReactToStringAsync(buildRoot(context, body), context.signal)}`;
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
