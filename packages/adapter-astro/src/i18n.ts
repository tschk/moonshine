/** Independent host-free Astro internationalization helpers (`astro:i18n`). */
import type { ValidRedirectStatus } from "./context";
import {
  defineMiddleware,
  type APIContext,
  type MiddlewareHandler,
} from "./middleware";

export type AstroI18nLocaleConfig =
  | string
  | {
      path: string;
      codes: [string, ...string[]];
    };

export interface AstroI18nRoutingOptions {
  prefixDefaultLocale?: boolean;
  redirectToDefaultLocale?: boolean;
  fallbackType?: "redirect" | "rewrite";
}

export type AstroI18nRoutingStrategy = "manual" | AstroI18nRoutingOptions;

export interface AstroI18nConfig {
  defaultLocale: string;
  locales: AstroI18nLocaleConfig[];
  routing?: AstroI18nRoutingStrategy;
  fallback?: Record<string, string>;
  domains?: Record<string, string>;
  base?: string;
  site?: string;
  trailingSlash?: "always" | "never" | "ignore";
}

export interface GetLocaleOptions {
  prependWith?: string;
  normalizeLocale?: boolean;
  base?: string;
  site?: string;
  trailingSlash?: "always" | "never" | "ignore";
  config?: AstroI18nConfig;
}

export class AstroI18nError extends Error {
  readonly code: string;

  constructor(message: string, code = "AstroI18nError") {
    super(message);
    this.name = "AstroI18nError";
    this.code = code;
  }
}

const DEFAULT_I18N_CONFIG: AstroI18nConfig = {
  defaultLocale: "en",
  locales: ["en"],
  routing: {
    prefixDefaultLocale: false,
    redirectToDefaultLocale: true,
    fallbackType: "redirect",
  },
};

let activeI18nConfig: AstroI18nConfig = DEFAULT_I18N_CONFIG;

export function configureI18n(config: AstroI18nConfig): AstroI18nConfig {
  activeI18nConfig = {
    ...config,
    routing:
      config.routing === "manual"
        ? "manual"
        : {
            prefixDefaultLocale: config.routing?.prefixDefaultLocale ?? false,
            redirectToDefaultLocale:
              config.routing?.redirectToDefaultLocale ?? true,
            fallbackType: config.routing?.fallbackType ?? "redirect",
          },
  };
  return activeI18nConfig;
}

export function getI18nConfig(): AstroI18nConfig {
  return activeI18nConfig;
}

export function resetI18nConfig(): void {
  activeI18nConfig = DEFAULT_I18N_CONFIG;
}

function resolveRoutingOptions(
  config: AstroI18nConfig,
): Required<AstroI18nRoutingOptions> {
  if (!config.routing || config.routing === "manual") {
    return {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: true,
      fallbackType: "redirect",
    };
  }
  return {
    prefixDefaultLocale: config.routing.prefixDefaultLocale ?? false,
    redirectToDefaultLocale: config.routing.redirectToDefaultLocale ?? true,
    fallbackType: config.routing.fallbackType ?? "redirect",
  };
}

export function toCodes(locales: AstroI18nLocaleConfig[]): string[] {
  const result: string[] = [];
  for (const entry of locales) {
    if (typeof entry === "string") {
      result.push(entry);
    } else {
      for (const code of entry.codes) {
        result.push(code);
      }
    }
  }
  return result;
}

export function toPaths(locales: AstroI18nLocaleConfig[]): string[] {
  return locales.map((entry) =>
    typeof entry === "string" ? entry : entry.path,
  );
}

export function getPathByLocale(
  locale: string,
  config: AstroI18nConfig = activeI18nConfig,
): string {
  for (const entry of config.locales) {
    if (typeof entry === "string") {
      if (entry === locale || entry.toLowerCase() === locale.toLowerCase()) {
        return entry;
      }
    } else if (
      entry.codes.some(
        (code) =>
          code === locale || code.toLowerCase() === locale.toLowerCase(),
      )
    ) {
      return entry.path;
    }
  }
  throw new AstroI18nError(
    `The locale "${locale}" is not present in your i18n configuration.`,
    "LocaleNotAvailable",
  );
}

export function getLocaleByPath(
  path: string,
  config: AstroI18nConfig = activeI18nConfig,
): string {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  for (const entry of config.locales) {
    if (typeof entry === "string") {
      if (
        entry === normalized ||
        entry.toLowerCase() === normalized.toLowerCase()
      ) {
        return entry;
      }
    } else if (
      entry.path === normalized ||
      entry.path.toLowerCase() === normalized.toLowerCase()
    ) {
      return entry.codes[0];
    }
  }
  throw new AstroI18nError(
    `No locale matches path "${path}" in your i18n configuration.`,
    "LocaleNotAvailable",
  );
}

export function normalizeTheLocale(locale: string): string {
  return locale.replaceAll("_", "-").toLowerCase();
}

function joinSegments(
  segments: Array<string | undefined>,
  trailingSlash: "always" | "never" | "ignore" = "ignore",
  hadTrailingSlash = false,
): string {
  const cleaned = segments
    .filter((s): s is string => Boolean(s && s.trim().length > 0))
    .map((s) => s.replace(/^\/+|\/+$/g, ""))
    .filter((s) => s.length > 0);
  if (cleaned.length === 0) {
    return "/";
  }
  const joined = "/" + cleaned.join("/");
  if (trailingSlash === "always") {
    return joined + "/";
  }
  if (trailingSlash === "never") {
    return joined;
  }
  return hadTrailingSlash ? joined + "/" : joined;
}

export function getRelativeLocaleUrl(
  locale: string,
  path = "",
  options?: GetLocaleOptions,
): string {
  const config = options?.config ?? activeI18nConfig;
  const routing = resolveRoutingOptions(config);
  const localePath = getPathByLocale(locale, config);
  const formattedLocale =
    options?.normalizeLocale === true
      ? normalizeTheLocale(localePath)
      : localePath;
  const isDefault =
    locale === config.defaultLocale ||
    localePath === getPathByLocale(config.defaultLocale, config);
  const shouldPrefix = !isDefault || routing.prefixDefaultLocale;
  const base = options?.base ?? config.base ?? "";
  const trailingSlash =
    options?.trailingSlash ?? config.trailingSlash ?? "ignore";
  const hadTrailingSlash = path.endsWith("/") && path.length > 1;

  return joinSegments(
    [
      base,
      options?.prependWith,
      shouldPrefix ? formattedLocale : undefined,
      path,
    ],
    trailingSlash,
    hadTrailingSlash,
  );
}

export function getAbsoluteLocaleUrl(
  locale: string,
  path = "",
  options?: GetLocaleOptions,
): string {
  const config = options?.config ?? activeI18nConfig;
  const domain = config.domains?.[locale];
  const siteBase = domain ?? options?.site ?? config.site ?? "http://localhost";
  const relative = getRelativeLocaleUrl(locale, path, {
    ...options,
    // If a dedicated domain is configured for this locale, don't prefix default locale on that domain unless prefixDefaultLocale is true
    base: domain ? undefined : (options?.base ?? config.base),
  });
  const baseNormalized = siteBase.replace(/\/+$/, "");
  return `${baseNormalized}${relative}`;
}

export function getRelativeLocaleUrlList(
  path = "",
  options?: GetLocaleOptions,
): string[] {
  const config = options?.config ?? activeI18nConfig;
  return config.locales.map((entry) => {
    const code = typeof entry === "string" ? entry : entry.codes[0];
    return getRelativeLocaleUrl(code, path, options);
  });
}

export function getAbsoluteLocaleUrlList(
  path = "",
  options?: GetLocaleOptions,
): string[] {
  const config = options?.config ?? activeI18nConfig;
  return config.locales.map((entry) => {
    const code = typeof entry === "string" ? entry : entry.codes[0];
    return getAbsoluteLocaleUrl(code, path, options);
  });
}

function extractLocaleSegmentFromPathname(
  pathname: string,
  config: AstroI18nConfig,
): { locale?: string; localePath?: string; restPath: string } {
  const base = (config.base ?? "").replace(/^\/+|\/+$/g, "");
  let stripped = pathname;
  if (base && (stripped === `/${base}` || stripped.startsWith(`/${base}/`))) {
    stripped = stripped.slice(base.length + 1) || "/";
  }
  const parts = stripped.split("/").filter(Boolean);
  const first = parts[0];
  if (!first) {
    return { restPath: "/" };
  }
  try {
    const locale = getLocaleByPath(first, config);
    const rest = "/" + parts.slice(1).join("/");
    return { locale, localePath: first, restPath: rest };
  } catch {
    return { restPath: stripped };
  }
}

export function redirectToDefaultLocale(
  context: APIContext,
  statusCode: ValidRedirectStatus = 302,
): Response {
  const config = activeI18nConfig;
  const target = getRelativeLocaleUrl(
    config.defaultLocale,
    context.url.pathname === "/" ? "" : context.url.pathname,
    { config },
  );
  return context.redirect(target + context.url.search, statusCode);
}

export function redirectToFallback(
  context: APIContext,
  response: Response,
): Promise<Response> | Response {
  if (response.status < 300 || !activeI18nConfig.fallback) {
    return response;
  }
  const config = activeI18nConfig;
  const routing = resolveRoutingOptions(config);
  const { locale, restPath } = extractLocaleSegmentFromPathname(
    context.url.pathname,
    config,
  );
  if (!locale) {
    return response;
  }
  const fallbackLocale = config.fallback?.[locale];
  if (!fallbackLocale) {
    return response;
  }
  const targetPath = getRelativeLocaleUrl(fallbackLocale, restPath, { config });
  if (routing.fallbackType === "rewrite") {
    return context.rewrite(targetPath + context.url.search);
  }
  return context.redirect(targetPath + context.url.search, 302);
}

export function notFound(context: APIContext, response?: Response): Response {
  if (response && response.headers.get("x-astro-reroute") === "no") {
    return response;
  }
  const config = activeI18nConfig;
  const routing = resolveRoutingOptions(config);
  const { locale } = extractLocaleSegmentFromPathname(
    context.url.pathname,
    config,
  );
  if (!locale && routing.prefixDefaultLocale) {
    return new Response(null, {
      status: 404,
      headers: response?.headers,
    });
  }
  return (
    response ??
    new Response(null, {
      status: 404,
    })
  );
}

export function requestHasLocale(
  locales: AstroI18nLocaleConfig[] = activeI18nConfig.locales,
): MiddlewareHandler {
  const validPaths = new Set(toPaths(locales).map((p) => p.toLowerCase()));
  return defineMiddleware(async (context, next) => {
    const parts = context.url.pathname.split("/").filter(Boolean);
    const hasMatch = parts.some((segment) =>
      validPaths.has(segment.toLowerCase()),
    );
    if (!hasMatch) {
      return new Response(null, { status: 404 });
    }
    return next();
  });
}

export function middleware(
  options?: AstroI18nRoutingOptions,
): MiddlewareHandler {
  return defineMiddleware(async (context, next) => {
    const config = activeI18nConfig;
    const baseRouting = resolveRoutingOptions(config);
    const routing: Required<AstroI18nRoutingOptions> = {
      prefixDefaultLocale:
        options?.prefixDefaultLocale ?? baseRouting.prefixDefaultLocale,
      redirectToDefaultLocale:
        options?.redirectToDefaultLocale ?? baseRouting.redirectToDefaultLocale,
      fallbackType: options?.fallbackType ?? baseRouting.fallbackType,
    };

    const { locale } = extractLocaleSegmentFromPathname(
      context.url.pathname,
      config,
    );
    context.currentLocale = locale ?? config.defaultLocale;

    if (
      context.url.pathname === "/" &&
      routing.prefixDefaultLocale &&
      routing.redirectToDefaultLocale
    ) {
      return redirectToDefaultLocale(context, 302);
    }

    const response = await next();
    if (response.status >= 400 && config.fallback) {
      const prevRouting = activeI18nConfig.routing;
      activeI18nConfig = { ...config, routing };
      try {
        return await redirectToFallback(context, response);
      } finally {
        activeI18nConfig = { ...config, routing: prevRouting };
      }
    }
    return response;
  });
}

export { middleware as i18nMiddleware };
