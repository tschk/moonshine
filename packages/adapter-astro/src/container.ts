/** Independent host-free Astro Container API (`astro/container`): `AstroContainer` and `experimental_AstroContainer`. */
import {
  AstroCookies,
  createAstroGlobal,
  withAstroContext,
  type AstroGlobal,
  type AstroSlotValue,
} from "./context";
import { createContext, type APIContext } from "./middleware";
import type { APIRoute } from "./routing";

export interface AstroContainerRenderer {
  name?: string;
  check: (
    component: unknown,
    props: Record<string, any>,
    slots: Record<string, string>,
  ) => boolean | Promise<boolean>;
  renderToStaticMarkup: (
    component: unknown,
    props: Record<string, any>,
    slots: Record<string, string>,
    metadata?: Record<string, any>,
  ) => { html: string } | string | Promise<{ html: string } | string>;
}

export interface AstroContainerClientRenderer {
  name: string;
  entrypoint: string;
}

export interface AstroContainerOptions {
  streaming?: boolean;
  renderers?: AstroContainerRenderer[];
  resolve?: (specifier: string) => string | Promise<string>;
  site?: string | URL;
  locals?: Record<string, any>;
  clientAddress?: string;
}

export interface ContainerRenderOptions<
  Props extends Record<string, any> = Record<string, any>,
> {
  props?: Props;
  params?: Record<string, string | undefined>;
  slots?: Record<string, AstroSlotValue>;
  request?: Request;
  url?: string | URL;
  routePattern?: string;
  locals?: Record<string, any>;
  cookies?: AstroCookies | Record<string, string> | string;
  site?: string | URL;
  clientAddress?: string;
  routeType?: "page" | "endpoint";
  partial?: boolean;
  status?: number;
  statusText?: string;
  headers?: HeadersInit;
}

export type EndpointModule = Partial<
  Record<
    "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ALL",
    APIRoute
  >
>;

export type AstroContainerComponent = (
  props: any,
  slotsOrContext?: any,
) => unknown;

export type AstroContainerRenderable =
  | AstroContainerComponent
  | EndpointModule
  | { default: AstroContainerComponent | EndpointModule }
  | string;

interface RegisteredPageRoute {
  pattern: string;
  component: AstroContainerRenderable;
  defaultParams?: Record<string, string | undefined>;
}

let cachedSsrMod: typeof import("./ssr") | undefined;

async function getSsrModule(): Promise<typeof import("./ssr")> {
  if (!cachedSsrMod) {
    const spec = "./ssr";
    cachedSsrMod = (await import(
      new URL(`${spec}.ts`, import.meta.url).href
    )) as typeof import("./ssr");
  }
  return cachedSsrMod;
}

function isSsrSymbolObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return Object.getOwnPropertySymbols(value).length > 0;
}

function isEndpointModule(value: unknown): value is EndpointModule {
  if (typeof value !== "object" || value === null) return false;
  const methods = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
    "ALL",
  ];
  return methods.some(
    (m) => typeof (value as Record<string, unknown>)[m] === "function",
  );
}

function unwrapRenderable(
  input: AstroContainerRenderable,
): AstroContainerComponent | EndpointModule | string {
  if (
    typeof input === "object" &&
    input !== null &&
    "default" in input &&
    input.default !== undefined
  ) {
    return input.default;
  }
  return input as AstroContainerComponent | EndpointModule | string;
}

function matchRoutePattern(
  pattern: string,
  pathname: string,
): Record<string, string | undefined> | null {
  const normPattern = pattern.startsWith("/") ? pattern : `/${pattern}`;
  const normPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

  const patSegments = normPattern.split("/").filter(Boolean);
  const pathSegments = normPath.split("/").filter(Boolean);
  const params: Record<string, string | undefined> = {};

  for (let i = 0; i < patSegments.length; i++) {
    const pat = patSegments[i]!;
    if (pat.startsWith("[...") && pat.endsWith("]")) {
      const name = pat.slice(4, -1);
      const rest = pathSegments.slice(i).join("/");
      params[name] = rest || undefined;
      return params;
    }
    if (i >= pathSegments.length) {
      return null;
    }
    const seg = pathSegments[i]!;
    if (pat.startsWith("[") && pat.endsWith("]")) {
      const name = pat.slice(1, -1);
      params[name] = decodeURIComponent(seg);
      continue;
    }
    if (pat !== seg) {
      return null;
    }
  }

  if (pathSegments.length !== patSegments.length) {
    return null;
  }
  return params;
}

interface InternalRenderResult {
  html: string;
  response?: Response;
  astro: AstroGlobal;
}

/**
 * Host-free Astro Container (`astro/container`) for rendering Astro components,
 * Moonshine SSR components, and API endpoints to strings or HTTP `Response`s in isolation.
 */
export class AstroContainer {
  readonly options: AstroContainerOptions;
  readonly #serverRenderers: AstroContainerRenderer[] = [];
  readonly #clientRenderers: AstroContainerClientRenderer[] = [];
  readonly #routes: RegisteredPageRoute[] = [];

  constructor(options: AstroContainerOptions = {}) {
    this.options = { ...options };
    if (options.renderers) {
      this.#serverRenderers.push(...options.renderers);
    }
  }

  static async create(
    options: AstroContainerOptions = {},
  ): Promise<AstroContainer> {
    return new AstroContainer(options);
  }

  addServerRenderer(
    input:
      | { name?: string; renderer: AstroContainerRenderer }
      | AstroContainerRenderer,
  ): void {
    const renderer = "renderer" in input ? input.renderer : input;
    this.#serverRenderers.push(renderer);
  }

  addClientRenderer(renderer: AstroContainerClientRenderer): void {
    this.#clientRenderers.push(renderer);
  }

  getServerRenderers(): readonly AstroContainerRenderer[] {
    return this.#serverRenderers;
  }

  getClientRenderers(): readonly AstroContainerClientRenderer[] {
    return this.#clientRenderers;
  }

  insertPageRoute(
    route: string,
    component: AstroContainerRenderable,
    defaultParams?: Record<string, string | undefined>,
  ): void {
    this.#routes.push({
      pattern: route,
      component,
      defaultParams,
    });
  }

  async resolve(specifier: string): Promise<string> {
    if (this.options.resolve) {
      return await this.options.resolve(specifier);
    }
    return specifier;
  }

  private async evaluateSlotsMap(
    rawSlots: Record<string, AstroSlotValue> = {},
  ): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [name, slotVal] of Object.entries(rawSlots)) {
      if (slotVal === undefined || slotVal === null || slotVal === false) {
        continue;
      }
      const resolved =
        typeof slotVal === "function" ? await slotVal() : await slotVal;
      if (resolved === undefined || resolved === null || resolved === false) {
        out[name] = "";
      } else if (isSsrSymbolObject(resolved)) {
        const ssr = await getSsrModule();
        out[name] = ssr.renderToString(() => resolved as any);
      } else {
        out[name] = String(resolved);
      }
    }
    return out;
  }

  private async renderInternal(
    componentInput: AstroContainerRenderable,
    options: ContainerRenderOptions = {},
  ): Promise<InternalRenderResult> {
    const target = unwrapRenderable(componentInput);
    const props = { ...options.props };
    const params = { ...options.params };
    const locals = {
      ...this.options.locals,
      ...options.locals,
    };
    const rawSlots = options.slots ?? {};

    const resolvedCookies =
      options.cookies instanceof AstroCookies
        ? options.cookies
        : options.cookies !== undefined
          ? new AstroCookies(options.cookies)
          : undefined;

    const responseHeaders = new Headers(options.headers);
    const rewriteHandler = async (
      targetUrl: URL,
      nextRequest: Request,
    ): Promise<Response> => {
      for (const route of this.#routes) {
        const matchedParams = matchRoutePattern(
          route.pattern,
          targetUrl.pathname,
        );
        if (matchedParams) {
          return await this.renderToResponse(route.component, {
            ...options,
            request: nextRequest,
            url: targetUrl,
            routePattern: route.pattern,
            params: {
              ...route.defaultParams,
              ...matchedParams,
            },
            locals,
          });
        }
      }
      const fallbackHeaders = new Headers(responseHeaders);
      fallbackHeaders.set(
        "x-astro-rewrite",
        targetUrl.pathname + targetUrl.search,
      );
      return new Response(null, {
        status: options.status ?? 200,
        statusText: options.statusText ?? "OK",
        headers: fallbackHeaders,
      });
    };

    const astro = createAstroGlobal({
      props,
      params,
      locals,
      slots: rawSlots,
      request: options.request,
      url: options.url,
      routePattern: options.routePattern,
      cookies: resolvedCookies,
      site: options.site ?? this.options.site,
      clientAddress: options.clientAddress ?? this.options.clientAddress,
      response: {
        status: options.status ?? 200,
        statusText: options.statusText ?? "OK",
        headers: responseHeaders,
      },
      rewriteHandler,
    });

    if (options.routeType === "endpoint" || isEndpointModule(target)) {
      const apiCtx: APIContext = createContext({
        request: astro.request,
        url: astro.url,
        params: astro.params,
        props: astro.props,
        locals: astro.locals,
        cookies: astro.cookies,
        site: astro.site,
        clientAddress: astro.clientAddress,
        rewriteHandler,
      });

      let handler: APIRoute | undefined;
      if (typeof target === "function") {
        handler = target as APIRoute;
      } else if (isEndpointModule(target)) {
        const method =
          astro.request.method.toUpperCase() as keyof EndpointModule;
        handler = target[method] ?? target.ALL;
      }
      if (!handler) {
        const notAllowed = new Response(null, {
          status: 405,
          statusText: "Method Not Allowed",
        });
        return { html: "", response: notAllowed, astro };
      }

      const endpointRes = await withAstroContext(astro, () => handler!(apiCtx));
      const clonedText = await endpointRes.clone().text();
      return {
        html: clonedText,
        response: endpointRes,
        astro,
      };
    }

    if (typeof target === "string") {
      return {
        html: this.applyDoctypeIfNeeded(target, options.partial),
        astro,
      };
    }

    const evaluatedSlots = await this.evaluateSlotsMap(rawSlots);

    for (const renderer of this.#serverRenderers) {
      if (await renderer.check(target, props, evaluatedSlots)) {
        const rendered = await withAstroContext(astro, () =>
          renderer.renderToStaticMarkup(target, props, evaluatedSlots),
        );
        const htmlStr = typeof rendered === "string" ? rendered : rendered.html;
        return {
          html: this.applyDoctypeIfNeeded(htmlStr, options.partial),
          astro,
        };
      }
    }

    if (typeof target === "function") {
      const ssr = await getSsrModule();
      const slotThunks: Record<string, () => any> = {};
      for (const [slotName, slotHtml] of Object.entries(evaluatedSlots)) {
        slotThunks[slotName] = () => ssr.rawHTML(slotHtml);
      }

      let directResult: unknown;
      let renderedHtml: string | undefined;

      await withAstroContext(astro, async () => {
        const candidate = ssr.renderToString(() => {
          const out = target(props, slotThunks);
          if (
            out instanceof Response ||
            (typeof out === "object" &&
              out !== null &&
              "then" in out &&
              typeof (out as PromiseLike<unknown>).then === "function")
          ) {
            directResult = out;
            return "";
          }
          return ssr.sourceChild(out);
        });
        if (directResult === undefined) {
          renderedHtml = candidate;
        }
      });

      if (directResult !== undefined) {
        const resolved = await withAstroContext(
          astro,
          async () => await directResult,
        );
        if (resolved instanceof Response) {
          const text = await resolved.clone().text();
          return {
            html: text,
            response: resolved,
            astro,
          };
        }
        if (isSsrSymbolObject(resolved)) {
          const html = withAstroContext(astro, () =>
            ssr.renderToString(() => resolved as any),
          );
          return {
            html: this.applyDoctypeIfNeeded(html, options.partial),
            astro,
          };
        }
        const str =
          resolved === null || resolved === undefined || resolved === false
            ? ""
            : String(resolved);
        return {
          html: this.applyDoctypeIfNeeded(str, options.partial),
          astro,
        };
      }

      return {
        html: this.applyDoctypeIfNeeded(renderedHtml ?? "", options.partial),
        astro,
      };
    }

    return {
      html: "",
      astro,
    };
  }

  private applyDoctypeIfNeeded(html: string, partial = true): string {
    if (partial) return html;
    const trimmed = html.trimStart();
    if (/^<!doctype\s+html/i.test(trimmed)) {
      return html;
    }
    return `<!DOCTYPE html>${html}`;
  }

  async renderToString(
    component: AstroContainerRenderable,
    options: ContainerRenderOptions = {},
  ): Promise<string> {
    const result = await this.renderInternal(component, {
      ...options,
      partial: options.partial ?? true,
    });
    return result.html;
  }

  async renderToResponse(
    component: AstroContainerRenderable,
    options: ContainerRenderOptions = {},
  ): Promise<Response> {
    const result = await this.renderInternal(component, {
      ...options,
      partial: options.partial ?? true,
    });

    if (result.response) {
      const headers = new Headers(result.response.headers);
      for (const [k, v] of result.astro.response.headers.entries()) {
        if (!headers.has(k)) {
          headers.set(k, v);
        }
      }
      for (const cookieHeader of result.astro.cookies.headers()) {
        headers.append("Set-Cookie", cookieHeader);
      }
      return new Response(result.response.body, {
        status: result.response.status,
        statusText: result.response.statusText,
        headers,
      });
    }

    const headers = new Headers(result.astro.response.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "text/html; charset=utf-8");
    }
    for (const cookieHeader of result.astro.cookies.headers()) {
      headers.append("Set-Cookie", cookieHeader);
    }

    return new Response(result.html, {
      status: result.astro.response.status,
      statusText: result.astro.response.statusText,
      headers,
    });
  }
}

export const experimental_AstroContainer = AstroContainer;
export type experimental_AstroContainer = AstroContainer;
