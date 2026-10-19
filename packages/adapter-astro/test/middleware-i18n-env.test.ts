import { beforeEach, describe, expect, test } from "bun:test";
import { useAstro } from "../src/context";
import {
  AstroEnvError,
  envField,
  getSecret,
  resetEnvSource,
  setEnvSource,
  validateEnv,
} from "../src/env";
import {
  AstroI18nError,
  configureI18n,
  getAbsoluteLocaleUrl,
  getAbsoluteLocaleUrlList,
  getLocaleByPath,
  getPathByLocale,
  getRelativeLocaleUrl,
  getRelativeLocaleUrlList,
  middleware as i18nMiddleware,
  notFound,
  redirectToDefaultLocale,
  redirectToFallback,
  requestHasLocale,
  resetI18nConfig,
  toCodes,
  toPaths,
} from "../src/i18n";
import {
  createContext,
  defineMiddleware,
  sequence,
  trySerializeLocals,
} from "../src/middleware";

describe("@tschk/moonshine-astro middleware, i18n & env helpers", () => {
  beforeEach(() => {
    resetI18nConfig();
    resetEnvSource();
  });

  test("defineMiddleware, sequence, rewrite payloads, cookie propagation, and trySerializeLocals", async () => {
    const order: string[] = [];

    const auth = defineMiddleware(async (context, next) => {
      order.push(`auth:in:${context.url.pathname}`);
      expect(useAstro()).toBe(context);
      context.locals.user = "ada";
      context.cookies.set("session", "abc123", { path: "/", httpOnly: true });
      const res = await next();
      order.push("auth:out");
      return res;
    });

    const rewriter = defineMiddleware(async (context, next) => {
      order.push(`rewrite:in:${context.url.pathname}`);
      if (context.url.pathname === "/legacy") {
        return next("/modern?migrated=1");
      }
      return next();
    });

    const pipeline = sequence(auth, undefined, rewriter);
    const ctx = createContext({
      url: "https://example.com/legacy",
      locals: {},
    });

    const response = await pipeline(ctx, async (rewritePayload) => {
      order.push(`handler:${ctx.url.pathname}${ctx.url.search}`);
      expect(rewritePayload).toBe("/modern?migrated=1");
      expect(ctx.locals.user).toBe("ada");
      return new Response(`Hello ${ctx.locals.user}`, { status: 200 });
    });

    expect(await response.text()).toBe("Hello ada");
    expect(order).toEqual([
      "auth:in:/legacy",
      "rewrite:in:/legacy",
      "handler:/modern?migrated=1",
      "auth:out",
    ]);
    expect(response.headers.get("set-cookie")).toContain("session=abc123");

    expect(trySerializeLocals({ user: "ada", tags: ["admin"], count: 3 })).toBe(
      JSON.stringify({ user: "ada", tags: ["admin"], count: 3 }),
    );
    expect(() => trySerializeLocals({ fn: () => {} })).toThrow(
      'locals.fn cannot be serialized: unsupported type "function"',
    );
  });

  test("i18n URL builders, locale mapping, fallback, and i18n middleware", async () => {
    configureI18n({
      defaultLocale: "en",
      locales: ["en", "fr", { path: "es", codes: ["es-ES", "es-MX"] }],
      site: "https://astro.example.com",
      base: "/docs",
      routing: {
        prefixDefaultLocale: false,
        redirectToDefaultLocale: true,
        fallbackType: "redirect",
      },
      fallback: {
        fr: "en",
      },
    });

    expect(
      toCodes(
        configureI18n.length
          ? ["en", { path: "es", codes: ["es-ES", "es-MX"] }]
          : [],
      ),
    ).toEqual(["en", "es-ES", "es-MX"]);
    expect(toPaths(["en", { path: "es", codes: ["es-ES", "es-MX"] }])).toEqual([
      "en",
      "es",
    ]);
    expect(getPathByLocale("es-MX")).toBe("es");
    expect(getLocaleByPath("es")).toBe("es-ES");
    expect(() => getPathByLocale("de")).toThrow(AstroI18nError);

    expect(getRelativeLocaleUrl("en", "getting-started")).toBe(
      "/docs/getting-started",
    );
    expect(getRelativeLocaleUrl("fr", "getting-started")).toBe(
      "/docs/fr/getting-started",
    );
    expect(
      getRelativeLocaleUrl("es-MX", "guide/", { trailingSlash: "always" }),
    ).toBe("/docs/es/guide/");
    expect(getAbsoluteLocaleUrl("fr", "intro")).toBe(
      "https://astro.example.com/docs/fr/intro",
    );
    expect(getRelativeLocaleUrlList("intro")).toEqual([
      "/docs/intro",
      "/docs/fr/intro",
      "/docs/es/intro",
    ]);
    expect(getAbsoluteLocaleUrlList("intro")).toEqual([
      "https://astro.example.com/docs/intro",
      "https://astro.example.com/docs/fr/intro",
      "https://astro.example.com/docs/es/intro",
    ]);

    const mw = i18nMiddleware();
    const frCtx = createContext({
      url: "https://astro.example.com/docs/fr/missing-page",
    });
    const fallbackRes = await mw(
      frCtx,
      async () => new Response("Not Found", { status: 404 }),
    );
    expect(frCtx.currentLocale).toBe("fr");
    expect(fallbackRes.status).toBe(302);
    expect(fallbackRes.headers.get("Location")).toBe("/docs/missing-page");

    const rewriteCtx = createContext({
      url: "https://astro.example.com/docs/fr/missing-page",
      rewriteHandler: (target) =>
        new Response(`Rewritten to ${target.pathname}`, { status: 200 }),
    });
    configureI18n({
      defaultLocale: "en",
      locales: ["en", "fr"],
      base: "/docs",
      routing: {
        prefixDefaultLocale: true,
        redirectToDefaultLocale: true,
        fallbackType: "rewrite",
      },
      fallback: { fr: "en" },
    });
    const rewritten = await redirectToFallback(
      rewriteCtx,
      new Response(null, { status: 404 }),
    );
    expect(await rewritten.text()).toBe("Rewritten to /docs/en/missing-page");

    const rootCtx = createContext({ url: "https://astro.example.com/" });
    const rootRedirect = redirectToDefaultLocale(rootCtx, 301);
    expect(rootRedirect.status).toBe(301);
    expect(rootRedirect.headers.get("Location")).toBe("/docs/en");

    const unprefixedCtx = createContext({
      url: "https://astro.example.com/docs/about",
    });
    expect(notFound(unprefixedCtx).status).toBe(404);

    const localeGuard = requestHasLocale(["en", "fr"]);
    const guarded404 = await localeGuard(
      createContext({ url: "https://astro.example.com/de/page" }),
      async () => new Response("ok"),
    );
    expect(guarded404.status).toBe(404);
  });

  test("envField, validateEnv, setEnvSource, and getSecret", () => {
    const schema = {
      PUBLIC_API_URL: envField.string({
        context: "client",
        access: "public",
        url: true,
      }),
      PORT: envField.number({
        context: "server",
        access: "public",
        int: true,
        min: 1024,
        max: 65535,
        default: 4321,
      }),
      ENABLE_CACHE: envField.boolean({
        context: "server",
        access: "public",
        default: false,
      }),
      NODE_ENV: envField.enum({
        context: "server",
        access: "public",
        values: ["development", "production", "test"] as const,
        default: "development",
      }),
      API_SECRET: envField.string({
        context: "server",
        access: "secret",
        min: 8,
      }),
      OPTIONAL_TAG: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
    };

    setEnvSource({
      PUBLIC_API_URL: "https://api.example.com/v1",
      PORT: "8080",
      ENABLE_CACHE: "true",
      NODE_ENV: "production",
      API_SECRET: "super-secret-token",
    });

    expect(getSecret("API_SECRET")).toBe("super-secret-token");

    const parsed = validateEnv(schema);
    expect(parsed).toEqual({
      PUBLIC_API_URL: "https://api.example.com/v1",
      PORT: 8080,
      ENABLE_CACHE: true,
      NODE_ENV: "production",
      API_SECRET: "super-secret-token",
      OPTIONAL_TAG: undefined,
    });

    expect(() =>
      envField.string({
        context: "client",
        access: "secret",
      }),
    ).toThrow(AstroEnvError);

    expect(() =>
      validateEnv(schema, {
        PUBLIC_API_URL: "not-a-url",
        PORT: "80",
        API_SECRET: "short",
      }),
    ).toThrow(AstroEnvError);
  });
});
