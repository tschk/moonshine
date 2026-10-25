/** Independent host-free Astro Configuration helpers (`astro/config`). */
import { envField, type EnvFieldDefinition } from "./env";
import type { AstroI18nConfig } from "./i18n";
import type { AstroSessionOptions, ValidRedirectStatus } from "./context";

export { envField };

export interface ImageServiceConfig<TConfig = any> {
  entrypoint: string;
  config?: TConfig;
}

export interface SharpImageServiceConfig {
  limitInputPixels?: number | boolean;
  kernel?: "nearest" | "cubic" | "mitchell" | "lanczos2" | "lanczos3";
}

export function passthroughImageService(): ImageServiceConfig {
  return {
    entrypoint: "astro/assets/services/noop",
    config: {},
  };
}

export function sharpImageService(
  config: SharpImageServiceConfig = {},
): ImageServiceConfig<SharpImageServiceConfig> {
  return {
    entrypoint: "astro/assets/services/sharp",
    config,
  };
}

export function squooshImageService(): ImageServiceConfig {
  return {
    entrypoint: "astro/assets/services/squoosh",
    config: {},
  };
}

export type RedirectConfig =
  | string
  | {
      status?: ValidRedirectStatus;
      destination: string;
    };

export interface AstroIntegration {
  name: string;
  hooks: Record<string, (...args: unknown[]) => unknown>;
}

export interface AstroUserConfig {
  root?: string;
  srcDir?: string;
  publicDir?: string;
  outDir?: string;
  cacheDir?: string;
  site?: string;
  compressHTML?: boolean;
  base?: string;
  trailingSlash?: "always" | "never" | "ignore";
  scopedStyleStrategy?: "attribute" | "class" | "where";
  output?: "static" | "server" | "hybrid";
  adapter?: {
    name: string;
    hooks?: Record<string, (...args: unknown[]) => unknown>;
  };
  integrations?: (
    AstroIntegration | AstroIntegration[] | false | undefined | null
  )[];
  build?: {
    format?: "file" | "directory" | "preserve";
    client?: string;
    server?: string;
    assets?: string;
    assetsPrefix?: string | Record<string, string>;
    serverEntry?: string;
    redirects?: boolean;
    inlineStylesheets?: "auto" | "always" | "never";
    concurrency?: number;
  };
  server?:
    | {
        host?: string | boolean;
        port?: number;
        open?: string | boolean;
        headers?: Record<string, string>;
      }
    | ((options: { command: "dev" | "preview" }) => {
        host?: string | boolean;
        port?: number;
        open?: string | boolean;
        headers?: Record<string, string>;
      });
  redirects?: Record<string, RedirectConfig>;
  prefetch?:
    | boolean
    | {
        prefetchAll?: boolean;
        defaultStrategy?: "tap" | "hover" | "viewport" | "load";
      };
  image?: {
    endpoint?: string | { route: string; entrypoint?: string };
    service?: ImageServiceConfig;
    domains?: string[];
    remotePatterns?: {
      protocol?: string;
      hostname?: string;
      port?: string;
      pathname?: string;
    }[];
    experimentalLayout?: "responsive" | "fixed" | "full-width" | "none";
  };
  markdown?: {
    drafts?: boolean;
    syntaxHighlight?: "shiki" | "prism" | false;
    shikiConfig?: Record<string, unknown>;
    remarkPlugins?: unknown[];
    rehypePlugins?: unknown[];
    gfm?: boolean;
    smartypants?: boolean;
  };
  i18n?: AstroI18nConfig;
  env?: {
    schema?: Record<string, EnvFieldDefinition<unknown>>;
    validateSecrets?: boolean;
  };
  session?: AstroSessionOptions & {
    driver?: string | { name: string; options?: Record<string, unknown> };
  };
  security?: {
    checkOrigin?: boolean;
  };
  vite?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface AstroConfig extends Omit<
  AstroUserConfig,
  "root" | "srcDir" | "publicDir" | "outDir" | "cacheDir" | "integrations"
> {
  root: URL;
  srcDir: URL;
  publicDir: URL;
  outDir: URL;
  cacheDir: URL;
  base: string;
  trailingSlash: "always" | "never" | "ignore";
  compressHTML: boolean;
  scopedStyleStrategy: "attribute" | "class" | "where";
  output: "static" | "server" | "hybrid";
  integrations: AstroIntegration[];
  redirects: Record<string, RedirectConfig>;
}

export function defineConfig<T extends AstroUserConfig>(config: T): T {
  return config;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (value instanceof URL || value instanceof RegExp || value instanceof Date)
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function mergeConfig<
  D extends Record<string, unknown>,
  O extends Record<string, unknown>,
>(defaults: D, overrides: O, isRoot = true): D & O {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const existing = merged[key];
    if (Array.isArray(existing) && Array.isArray(value)) {
      merged[key] = [...existing, ...value];
    } else if (isPlainObject(existing) && isPlainObject(value)) {
      merged[key] = mergeConfig(existing, value, isRoot && key === "astro");
    } else {
      merged[key] = value;
    }
  }
  return merged as D & O;
}

function resolveDirUrl(
  dir: string | undefined,
  fallback: string,
  root: URL,
): URL {
  const raw = dir ?? fallback;
  const normalized = raw.endsWith("/") ? raw : `${raw}/`;
  return new URL(normalized, root);
}

export async function validateConfig(
  userConfig: AstroUserConfig = {},
  root = "file:///app/",
): Promise<AstroConfig> {
  if (typeof userConfig !== "object" || userConfig === null) {
    throw new TypeError("Astro configuration must be an object");
  }
  if (userConfig.site !== undefined) {
    try {
      const parsed = new URL(userConfig.site);
      if (!parsed.protocol) {
        throw new Error("Missing protocol");
      }
    } catch {
      throw new Error(
        `Invalid Astro config "site": "${userConfig.site}" is not a valid URL.`,
      );
    }
  }
  const rootBase = root.startsWith("file://")
    ? root.endsWith("/")
      ? root
      : `${root}/`
    : `file://${root.startsWith("/") ? "" : "/"}${root.endsWith("/") ? root : `${root}/`}`;
  const rootUrl = new URL(
    userConfig.root
      ? userConfig.root.endsWith("/")
        ? userConfig.root
        : `${userConfig.root}/`
      : "./",
    rootBase,
  );
  const flatIntegrations: AstroIntegration[] = [];
  for (const item of userConfig.integrations ?? []) {
    if (!item) continue;
    if (Array.isArray(item)) {
      for (const nested of item) {
        if (nested) flatIntegrations.push(nested);
      }
    } else {
      flatIntegrations.push(item);
    }
  }

  return {
    ...userConfig,
    root: rootUrl,
    srcDir: resolveDirUrl(userConfig.srcDir, "./src/", rootUrl),
    publicDir: resolveDirUrl(userConfig.publicDir, "./public/", rootUrl),
    outDir: resolveDirUrl(userConfig.outDir, "./dist/", rootUrl),
    cacheDir: resolveDirUrl(
      userConfig.cacheDir,
      "./node_modules/.astro/",
      rootUrl,
    ),
    base: userConfig.base ?? "/",
    trailingSlash: userConfig.trailingSlash ?? "ignore",
    compressHTML: userConfig.compressHTML ?? true,
    scopedStyleStrategy: userConfig.scopedStyleStrategy ?? "attribute",
    output: userConfig.output ?? "static",
    integrations: flatIntegrations,
    redirects: userConfig.redirects ?? {},
    image: {
      service: sharpImageService(),
      ...userConfig.image,
    },
    security: {
      checkOrigin: true,
      ...userConfig.security,
    },
  };
}
