/**
 * Host-free Vue 3 server-renderer runtime on Moonshine SSR.
 * Provides `renderToString`, `renderToWebStream`, `renderToSimpleStream`,
 * `useSSRContext`, `SSRContext`, and low-level `ssr*` template helpers.
 */
import {
  escapeHtml,
  h as hSSR,
  renderToString as renderMoonshineSSR,
  type SSRChild,
} from "@tschk/moonshine-dom/ssr";
import { renderAppSSRSymbol, type NativeApplication } from "./app";
import {
  peekSSRContext,
  useSSRContext,
  withSSRContext,
  withSSRContextAsync,
  type SSRContext,
} from "./context";
import {
  withServerPrefetchSession,
  type ServerPrefetchSession,
} from "./lifecycle";
import { normalizeClassSSR, normalizeStyleSSR } from "./normalize";
import { toDisplayStringSSR } from "./text";

export { useSSRContext, type SSRContext };

export interface SimpleReadable {
  push(chunk: string | null): void;
  destroy(err: unknown): void;
}

function isNativeApp(
  input: unknown,
): input is NativeApplication & { [renderAppSSRSymbol]: () => SSRChild } {
  return (
    typeof input === "object" &&
    input !== null &&
    renderAppSSRSymbol in input &&
    typeof (input as any)[renderAppSSRSymbol] === "function"
  );
}

function executeRenderPass(input: unknown, ssrContext: SSRContext): string {
  return withSSRContext(ssrContext, () =>
    renderMoonshineSSR(() => {
      if (isNativeApp(input)) {
        return input[renderAppSSRSymbol]();
      }
      if (typeof input === "function") {
        return hSSR(input as (props?: any) => SSRChild, {});
      }
      return input as SSRChild;
    }),
  );
}

/**
 * Asynchronously render a native Vue application or component factory to an HTML string,
 * awaiting any `onServerPrefetch` hooks and populating `context.teleports`.
 */
export async function renderToString(
  input: unknown,
  context?: SSRContext,
): Promise<string> {
  const ssrContext: SSRContext = context ?? {};
  const initialTeleports = ssrContext.teleports
    ? { ...ssrContext.teleports }
    : undefined;
  const session: ServerPrefetchSession = {
    phase: "collect",
    hooks: [],
    cells: [],
    cursor: 0,
  };

  const firstHtml = withServerPrefetchSession(session, () =>
    executeRenderPass(input, ssrContext),
  );

  if (session.hooks.length === 0) {
    return firstHtml;
  }

  session.phase = "awaiting";
  await withSSRContextAsync(ssrContext, () =>
    Promise.all(session.hooks.map((hook) => hook())),
  );

  session.phase = "replay";
  session.cursor = 0;
  if (initialTeleports) {
    ssrContext.teleports = { ...initialTeleports };
  } else {
    delete ssrContext.teleports;
  }

  return withServerPrefetchSession(session, () =>
    executeRenderPass(input, ssrContext),
  );
}

/**
 * Render a native Vue application or component factory to a Web `ReadableStream<Uint8Array>`.
 */
export function renderToWebStream(
  input: unknown,
  context?: SSRContext,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const html = await renderToString(input, context);
        if (html.length > 0) {
          controller.enqueue(encoder.encode(html));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Render a native Vue application or component factory into a `SimpleReadable` stream sink.
 */
export function renderToSimpleStream<T extends SimpleReadable>(
  input: unknown,
  context: SSRContext | undefined,
  stream: T,
): T {
  renderToString(input, context)
    .then((html) => {
      if (html.length > 0) {
        stream.push(html);
      }
      stream.push(null);
    })
    .catch((error) => {
      stream.destroy(error);
    });
  return stream;
}

/** Interpolate and HTML-escape a display value for SSR output. */
export function ssrInterpolate(value: unknown): string {
  return escapeHtml(toDisplayStringSSR(value));
}

/** Render a single HTML attribute key/value pair with leading space when active. */
export function ssrRenderAttr(key: string, value: unknown): string {
  if (
    value === undefined ||
    value === null ||
    value === false ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return "";
  }
  if (value === true) {
    return ` ${key}`;
  }
  return ` ${key}="${escapeHtml(String(value))}"`;
}

/** Normalize and escape a dynamic `class` value for SSR attribute interpolation. */
export function ssrRenderClass(raw: unknown): string {
  return escapeHtml(normalizeClassSSR(raw));
}

/** Normalize and escape a dynamic `style` value for SSR attribute interpolation. */
export function ssrRenderStyle(raw: unknown): string {
  const normalized = normalizeStyleSSR(raw);
  if (!normalized) return "";
  if (typeof normalized === "string") return escapeHtml(normalized);
  if (typeof normalized === "object") {
    const parts: string[] = [];
    for (const [key, val] of Object.entries(normalized)) {
      if (
        val === undefined ||
        val === null ||
        val === "" ||
        typeof val === "boolean"
      ) {
        continue;
      }
      const cssKey = key.startsWith("--")
        ? key
        : key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
      parts.push(`${cssKey}:${String(val)}`);
    }
    return escapeHtml(parts.join(";"));
  }
  return escapeHtml(String(normalized));
}

/** Render an attributes map into a space-prefixed HTML attribute string. */
export function ssrRenderAttrs(
  attrs: Record<string, unknown> | null | undefined,
): string {
  if (!attrs || typeof attrs !== "object") return "";
  let out = "";
  for (const [key, value] of Object.entries(attrs)) {
    if (
      key === "key" ||
      key === "ref" ||
      key === "children" ||
      key === "$slots" ||
      key === "slots" ||
      key.startsWith("on")
    ) {
      continue;
    }
    if (key === "class") {
      const cls = ssrRenderClass(value);
      if (cls) out += ` class="${cls}"`;
      continue;
    }
    if (key === "style") {
      const style = ssrRenderStyle(value);
      if (style) out += ` style="${style}"`;
      continue;
    }
    out += ssrRenderAttr(key, value);
  }
  return out;
}

/** Render an SSR teleport block into `SSRContext.teleports` or inline when disabled. */
export function ssrRenderTeleport(
  parentPush: (chunk: string) => void,
  contentRenderFn: (push: (chunk: string) => void) => void,
  target: string | null | undefined,
  disabled?: boolean,
  context?: SSRContext,
): void {
  parentPush("<!--teleport start-->");
  let teleportContent = "";
  contentRenderFn((chunk) => {
    teleportContent += chunk;
  });
  if (disabled) {
    parentPush(teleportContent);
  } else if (typeof target === "string" && target) {
    const ssrCtx = context ?? peekSSRContext();
    if (ssrCtx) {
      ssrCtx.teleports ??= {};
      ssrCtx.teleports[target] =
        (ssrCtx.teleports[target] ?? "") + teleportContent;
    }
  }
  parentPush("<!--teleport end-->");
}
