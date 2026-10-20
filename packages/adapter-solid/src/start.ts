/**
 * Host-free `@solidjs/start`, `@solidjs/start/server`, and `@solidjs/start/client`
 * replacement backed by the Moonshine reactive graph and DOM/SSR renderers.
 */
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import {
  createMemo,
  createSignal,
  getOwner,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import {
  h as hSSR,
  renderToString,
  type SSRChild,
} from "@tschk/moonshine-dom/ssr";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { render } from "./cleanup-policy";
import { createComponent, h as hDOM } from "./component-factory";
import { splitProps } from "./props";
import {
  createSolidRequestEvent,
  FETCH_EVENT_TYPE,
  getRequestEvent,
  withSolidRequestEvent,
  type PageEvent,
  type RequestEvent,
  type ResponseStub,
  type SolidRequestEventInit,
} from "./request-event";
import { Assets, HydrationScript } from "./ssr";

export {
  FETCH_EVENT_TYPE,
  createSolidRequestEvent,
  getRequestEvent,
  withSolidRequestEvent,
  type PageEvent,
  type RequestEvent,
  type ResponseStub,
  type SolidRequestEventInit,
};

export interface ClientOnlyOptions {
  lazy?: boolean;
}

export type ClientOnlyProps<P = Record<string, any>> = P & {
  fallback?: any;
};

export type ClientOnlyComponent<P = Record<string, any>, T = any> = ((
  props: ClientOnlyProps<P>,
) => any) & {
  preload: () => Promise<{ default: (props: P) => T }>;
};

function renderFallback(fallback: unknown): any {
  if (fallback === undefined || fallback === null) return "";
  return typeof fallback === "function" ? fallback() : fallback;
}

export function clientOnly<
  P extends Record<string, any> = Record<string, any>,
  T = any,
>(
  fn: () => Promise<{ default: (props: P) => T }>,
  options?: ClientOnlyOptions,
): ClientOnlyComponent<P, T> {
  let pending: Promise<{ default: (props: P) => T }> | undefined;
  let resolvedComp: ((props: P) => T) | undefined;

  const preload = (): Promise<{ default: (props: P) => T }> => {
    if (!pending) {
      const result = untrack(fn);
      pending = Promise.resolve(result).then((mod) => {
        const comp = mod?.default;
        if (typeof comp !== "function") {
          throw new TypeError(
            "clientOnly modules require a default component function",
          );
        }
        resolvedComp = comp;
        return mod;
      });
      void pending.catch(() => {});
    }
    return pending;
  };

  if (
    options?.lazy === false &&
    typeof document !== "undefined" &&
    !isSSRRendering() &&
    peekComponentContext()?.mode !== "ssr"
  ) {
    void preload();
  }

  const Component = (rawProps: ClientOnlyProps<P>) => {
    const props = (rawProps ?? {}) as ClientOnlyProps<P>;
    if (isSSRRendering() || peekComponentContext()?.mode === "ssr") {
      return renderFallback(props.fallback);
    }

    if (resolvedComp) {
      const [, rest] = splitProps(props as Record<string, any>, ["fallback"]);
      if (getOwner()) {
        return createComponent(resolvedComp, rest as unknown as P);
      }
      return resolvedComp(rest as unknown as P);
    }

    const [compSignal, setCompSignal] = createSignal<
      ((props: P) => T) | undefined
    >(resolvedComp);
    let disposed = false;
    if (getOwner()) {
      onCleanup(() => {
        disposed = true;
      });
    }

    void preload().then((mod) => {
      if (!disposed) {
        setCompSignal(() => mod.default);
      }
    });

    if (getOwner()) {
      return createMemo(() => {
        const Comp = compSignal();
        if (!Comp) {
          return renderFallback(props.fallback);
        }
        const [, rest] = splitProps(props as Record<string, any>, ["fallback"]);
        return createComponent(Comp, rest as unknown as P);
      });
    }
    return renderFallback(props.fallback);
  };

  return Object.assign(Component, { preload });
}

// ============================================================================
// Server Function Metadata & `GET` (`@solidjs/start` / `@solidjs/start/server`)
// ============================================================================

export interface ServerFunctionMeta {
  id: string;
}

const serverFnMetaStack: ServerFunctionMeta[] = [];

export function getServerFunctionMeta(): ServerFunctionMeta | undefined {
  return serverFnMetaStack[serverFnMetaStack.length - 1];
}

export function withServerFunctionMeta<T>(
  meta: ServerFunctionMeta,
  fn: () => T,
): T {
  serverFnMetaStack.push(meta);
  let isAsync = false;
  try {
    const res = fn();
    if (
      res &&
      typeof (res as unknown as Promise<unknown>).then === "function"
    ) {
      isAsync = true;
      return (res as unknown as Promise<unknown>).finally(() => {
        const idx = serverFnMetaStack.lastIndexOf(meta);
        if (idx !== -1) serverFnMetaStack.splice(idx, 1);
      }) as unknown as T;
    }
    return res;
  } finally {
    if (!isAsync) {
      const idx = serverFnMetaStack.lastIndexOf(meta);
      if (idx !== -1) serverFnMetaStack.splice(idx, 1);
    }
  }
}

export type GetServerFunction<T extends (...args: any[]) => any> = T & {
  readonly url: string;
  readonly GET: true;
  readonly id: string;
};

let serverFunctionCounter = 0;
const serverFunctionRegistry = new Map<string, (...args: any[]) => any>();

export function clearServerFunctions(): void {
  serverFunctionRegistry.clear();
}

export function GET<T extends (...args: any[]) => any>(
  fn: T,
  options?: string | { id?: string },
): GetServerFunction<T> {
  const explicitId = typeof options === "string" ? options : options?.id;
  const id =
    explicitId ??
    (fn.name
      ? `${fn.name}_${++serverFunctionCounter}`
      : `get_${++serverFunctionCounter}`);
  const baseUrl = `/_server?id=${encodeURIComponent(id)}`;

  const wrapped = ((...args: Parameters<T>): ReturnType<T> => {
    return withServerFunctionMeta({ id }, () => fn(...args));
  }) as unknown as GetServerFunction<T>;

  Object.defineProperties(wrapped, {
    url: { value: baseUrl, enumerable: true, writable: false },
    GET: { value: true, enumerable: true, writable: false },
    id: { value: id, enumerable: true, writable: false },
  });

  serverFunctionRegistry.set(id, wrapped);
  return wrapped;
}

export async function handleServerFunction(
  requestOrInit: Request | SolidRequestEventInit,
): Promise<Response | null> {
  const event =
    requestOrInit instanceof Request
      ? createSolidRequestEvent({ request: requestOrInit })
      : createSolidRequestEvent(requestOrInit);
  const url = new URL(event.request.url);
  const isServerEndpoint =
    url.pathname === "/_server" || url.pathname.startsWith("/_server/");
  if (!isServerEndpoint) {
    return null;
  }
  const rawId =
    url.searchParams.get("id") ||
    decodeURIComponent(url.pathname.slice("/_server/".length));
  const handler = serverFunctionRegistry.get(rawId);
  if (!handler) {
    return new Response(
      JSON.stringify({ error: `Server function "${rawId}" not found` }),
      {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }

  return withSolidRequestEvent(event, async () => {
    let args: any[] = [];
    const rawArgs =
      url.searchParams.get("payload") ?? url.searchParams.get("args");
    if (rawArgs) {
      try {
        const parsed = JSON.parse(rawArgs);
        args = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        args = [rawArgs];
      }
    }
    const result = await handler(...args);
    if (result instanceof Response) {
      const mergedHeaders = new Headers(event.response.headers);
      result.headers.forEach((v, k) => mergedHeaders.set(k, v));
      return new Response(result.body, {
        status: result.status || event.response.status || 200,
        statusText: result.statusText || event.response.statusText,
        headers: mergedHeaders,
      });
    }
    const headers = new Headers(event.response.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json; charset=utf-8");
    }
    return new Response(JSON.stringify(result ?? null), {
      status: event.response.status ?? 200,
      statusText: event.response.statusText,
      headers,
    });
  });
}

// ============================================================================
// `@solidjs/start/server` (`StartServer`, `createHandler`)
// ============================================================================

export interface DocumentComponentProps {
  assets: any;
  children: any;
  scripts: any;
}

export interface StartServerProps {
  document?: (props: DocumentComponentProps) => any;
  children?: any;
}

export function StartServer(props: StartServerProps = {}): any {
  const isDomActive =
    Boolean(getOwner()) &&
    !isSSRRendering() &&
    peekComponentContext()?.mode === "dom";
  const h: (...args: any[]) => any = isDomActive ? hDOM : hSSR;
  const resolvedChildren =
    typeof props.children === "function"
      ? props.children()
      : (props.children ?? null);

  if (typeof props.document === "function") {
    return props.document({
      assets: h(Assets, {}),
      children: resolvedChildren,
      scripts: h(HydrationScript, {}),
    });
  }
  if (!isDomActive) {
    return h(
      "html",
      { lang: "en" },
      h("head", {}, h("meta", { charset: "utf-8" }), h(Assets, {})),
      h(
        "body",
        {},
        h("div", { id: "app" }, resolvedChildren),
        h(HydrationScript, {}),
      ),
    );
  }
  return resolvedChildren;
}

export interface HandlerOptions {
  mode?: "sync" | "async" | "stream";
  nonce?: string;
  renderId?: string;
}

export type StartAppHandler = ((
  requestOrInit: Request | SolidRequestEventInit,
) => Promise<Response>) & {
  fetch: (requestOrInit: Request | SolidRequestEventInit) => Promise<Response>;
};

export function createHandler(
  fn?: (event: PageEvent) => any,
  _options?: HandlerOptions,
): StartAppHandler {
  const handler = async (
    requestOrInit: Request | SolidRequestEventInit,
  ): Promise<Response> => {
    const event =
      requestOrInit instanceof Request
        ? createSolidRequestEvent({ request: requestOrInit })
        : createSolidRequestEvent(requestOrInit);

    const serverFnResponse = await handleServerFunction({
      request: event.request,
      responseHeaders: event.response.headers,
      status: event.response.status,
      statusText: event.response.statusText,
      clientAddress: event.clientAddress,
      locals: event.locals,
      fetch: event.fetch,
      prevUrl: event.prevUrl,
      mutation: event.mutation,
      nativeEvent: event.nativeEvent,
    });
    if (serverFnResponse) {
      return serverFnResponse;
    }

    return withSolidRequestEvent(event, async () => {
      const result = fn ? await fn(event) : "";
      if (result instanceof Response) {
        const mergedHeaders = new Headers(event.response.headers);
        result.headers.forEach((v, k) => mergedHeaders.set(k, v));
        return new Response(result.body, {
          status: result.status || event.response.status || 200,
          statusText: result.statusText || event.response.statusText,
          headers: mergedHeaders,
        });
      }

      const rawHtml =
        typeof result === "string"
          ? result
          : typeof result === "function"
            ? renderToString(result as () => SSRChild)
            : renderToString(() => result as SSRChild);
      const html =
        /^\s*<html[\s>]/i.test(rawHtml) && !/^\s*<!doctype/i.test(rawHtml)
          ? `<!DOCTYPE html>${rawHtml}`
          : rawHtml;

      const headers = new Headers(event.response.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "text/html; charset=utf-8");
      }
      return new Response(html, {
        status: event.response.status ?? 200,
        statusText: event.response.statusText,
        headers,
      });
    });
  };
  return Object.assign(handler, { fetch: handler });
}

// ============================================================================
// `@solidjs/start/client` (`StartClient`, `mount`)
// ============================================================================

export interface StartClientProps {
  children?: any;
}

export function StartClient(props: StartClientProps = {}): any {
  return typeof props.children === "function"
    ? props.children()
    : (props.children ?? null);
}

export function mount(
  fn: () => any,
  el: Element | Document | null | undefined,
): () => void {
  if (!el) return () => {};
  const target: Element =
    "body" in el && el.body ? (el.body as Element) : (el as Element);
  return render(fn, target);
}
