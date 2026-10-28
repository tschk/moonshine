import { describe, expect, test } from "bun:test";
import "../../react/test/dom";
import {
  ACTION_ERROR_CODES,
  ActionError,
  ActionInputError,
  actionPathToString,
  defineAction,
  deserializeActionResult,
  getActionContext,
  getActionQueryString,
  isActionError,
  isInputError,
  serializeActionResult,
} from "../src/actions";
import {
  defineConfig,
  envField,
  mergeConfig,
  passthroughImageService,
  sharpImageService,
  squooshImageService,
  validateConfig,
} from "../src/config";
import {
  AstroCookie,
  AstroCookies,
  AstroSession,
  clearAstroSessions,
  createAstroGlobal,
  useAstro,
  withAstroContext,
} from "../src/context";
import { h, renderToString } from "../src/ssr";
import {
  ClientRouter,
  createAnimationScope,
  fade,
  isTransitionEnabled,
  navigate,
  none,
  slide,
  supportsViewTransitions,
  swapFunctions,
  transition,
  TRANSITION_AFTER_PREPARATION,
  TRANSITION_AFTER_SWAP,
  TRANSITION_BEFORE_PREPARATION,
  TRANSITION_BEFORE_SWAP,
  TRANSITION_PAGE_LOAD,
  ViewTransitions,
} from "../src/transitions";

describe("@tschk/moonshine-astro/context", () => {
  test("AstroCookies parses RFC 6265 headers, reads typed cookies, and serializes Set-Cookie headers", () => {
    const req = new Request("https://example.com/dashboard", {
      headers: {
        cookie:
          'theme=dark; count=42; enabled=true; disabled=false; zero=0; prefs=%7B%22sidebar%22%3Atrue%7D; quoted="hello"',
      },
    });
    const cookies = new AstroCookies(req);

    expect(cookies.has("theme")).toBe(true);
    expect(cookies.has("missing")).toBe(false);
    expect(cookies.get("theme")?.value).toBe("dark");
    expect(cookies.get("quoted")?.value).toBe("hello");
    expect(cookies.get("count")?.number()).toBe(42);
    expect(cookies.get("enabled")?.boolean()).toBe(true);
    expect(cookies.get("disabled")?.boolean()).toBe(false);
    expect(cookies.get("zero")?.boolean()).toBe(false);
    expect(cookies.get("prefs")?.json<{ sidebar: boolean }>()).toEqual({
      sidebar: true,
    });

    cookies.set("session", "abc 123", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
      partitioned: true,
    });
    expect(cookies.get("session")?.value).toBe("abc 123");

    cookies.set(
      "flags",
      { beta: true },
      { sameSite: true, domain: "example.com" },
    );
    expect(cookies.get("flags")?.json<{ beta: boolean }>()).toEqual({
      beta: true,
    });

    cookies.delete("theme", { path: "/" });
    expect(cookies.has("theme")).toBe(false);
    expect(cookies.get("theme")).toBeUndefined();

    const headerList = Array.from(cookies.headers());
    expect(headerList).toHaveLength(3);
    expect(headerList[0]).toBe(
      "session=abc%20123; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax; Partitioned",
    );
    expect(headerList[1]).toContain("flags=%7B%22beta%22%3Atrue%7D");
    expect(headerList[1]).toContain("Domain=example.com");
    expect(headerList[1]).toContain("SameSite=Strict");
    expect(headerList[2]).toContain("theme=; Max-Age=0; Path=/; Expires=");

    const other = new AstroCookies({ extra: "1" });
    other.set("merged", "yes");
    cookies.merge(other);
    expect(cookies.get("merged")?.value).toBe("yes");
    expect(new AstroCookie("1").boolean()).toBe(true);
  });

  test("createAstroGlobal, withAstroContext, and useAstro provide isolated request state, redirect, and rewrite", async () => {
    const astro = createAstroGlobal({
      props: { title: "Docs" },
      url: "https://example.com/docs/intro?tab=api",
      params: { slug: "intro" },
      locals: { userId: "u_1" },
      site: "https://example.com",
      preferredLocale: "en",
      preferredLocaleList: ["en", "fr"],
      currentLocale: "en",
    });

    expect(astro.props.title).toBe("Docs");
    expect(astro.url.pathname).toBe("/docs/intro");
    expect(astro.params.slug).toBe("intro");
    expect(astro.locals.userId).toBe("u_1");
    expect(astro.site?.href).toBe("https://example.com/");
    expect(astro.generator).toBe("Moonshine Astro");
    expect(astro.originPathname).toBe("/docs/intro");

    astro.cookies.set("flash", "saved", { path: "/" });
    const redirectRes = astro.redirect("/login", 303);
    expect(redirectRes.status).toBe(303);
    expect(redirectRes.headers.get("Location")).toBe("/login");
    expect(redirectRes.headers.get("Set-Cookie")).toContain("flash=saved");

    const rewriteRes = await astro.rewrite("/internal/docs");
    expect(rewriteRes.headers.get("x-astro-rewrite")).toBe("/internal/docs");

    const asyncResult = await withAstroContext(
      {
        props: { page: "outer" },
        locals: { role: "admin" },
      },
      async () => {
        expect(useAstro().props.page).toBe("outer");
        const nested = withAstroContext(
          { props: { page: "inner" }, locals: { role: "guest" } },
          () => useAstro().props.page + ":" + useAstro().locals.role,
        );
        expect(nested).toBe("inner:guest");
        expect(useAstro().props.page).toBe("outer");
        await Promise.resolve();
        return useAstro().locals.role;
      },
    );
    expect(asyncResult).toBe("admin");
  });
});

describe("@tschk/moonshine-astro/actions", () => {
  test("ActionError and ActionInputError map status codes and field issues", () => {
    expect(ActionError.codeToStatus("UNAUTHORIZED")).toBe(401);
    expect(ActionError.codeToStatus("UNPROCESSABLE_CONTENT")).toBe(422);
    expect(ActionError.statusToCode(404)).toBe("NOT_FOUND");
    expect(ActionError.statusToCode(999)).toBe("INTERNAL_SERVER_ERROR");
    expect(ACTION_ERROR_CODES.TOO_MANY_REQUESTS).toBe(429);

    const err = new ActionError({
      code: "FORBIDDEN",
      message: "Access denied",
    });
    expect(err.code).toBe("FORBIDDEN");
    expect(err.status).toBe(403);
    expect(err.type).toBe("AstroActionError");
    expect(isActionError(err)).toBe(true);
    expect(isInputError(err)).toBe(false);

    const inputErr = new ActionInputError<{ email: string; age: number }>([
      { path: ["email"], message: "Invalid email" },
      { path: ["email"], message: "Required" },
      { path: ["age"], message: "Must be positive" },
    ]);
    expect(inputErr.code).toBe("BAD_REQUEST");
    expect(inputErr.status).toBe(400);
    expect(isActionError(inputErr)).toBe(true);
    expect(isInputError(inputErr)).toBe(true);
    expect(inputErr.fields.email).toEqual(["Invalid email", "Required"]);
    expect(inputErr.fields.age).toEqual(["Must be positive"]);
  });

  test("defineAction validates JSON and FormData inputs, returns SafeResult, and supports .orThrow()", async () => {
    const greet = defineAction({
      name: "user.greet",
      input: {
        safeParse(raw: unknown) {
          const obj = raw as { name?: unknown };
          if (typeof obj?.name !== "string" || obj.name.trim().length < 2) {
            return {
              success: false as const,
              error: {
                issues: [{ path: ["name"], message: "Name is too short" }],
              },
            };
          }
          return {
            success: true as const,
            data: { name: obj.name.trim() },
          };
        },
      },
      handler: async (input, context) => {
        if (input.name === "forbidden") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Name not allowed",
          });
        }
        const prefix =
          (context.locals as { prefix?: string }).prefix ?? "Hello";
        return { greeting: `${prefix}, ${input.name}!` };
      },
    });

    expect(greet.queryString).toBe("?_action=user.greet");
    expect(getActionQueryString("posts.create")).toBe("?_action=posts.create");
    expect(actionPathToString(["posts", "create"])).toBe("posts.create");

    const okResult = await withAstroContext(
      { locals: { prefix: "Welcome" } },
      () => greet({ name: "  Ada  " }),
    );
    expect(okResult).toEqual({
      data: { greeting: "Welcome, Ada!" },
      error: undefined,
    });
    expect(await greet.orThrow({ name: "Grace" })).toEqual({
      greeting: "Hello, Grace!",
    });

    const badInput = await greet({ name: "a" });
    expect(badInput.data).toBeUndefined();
    expect(isInputError(badInput.error)).toBe(true);
    if (isInputError(badInput.error)) {
      expect(badInput.error.fields.name).toEqual(["Name is too short"]);
    }

    const forbidden = await greet({ name: "forbidden" });
    expect(forbidden.data).toBeUndefined();
    expect(forbidden.error?.code).toBe("FORBIDDEN");
    expect(forbidden.error?.status).toBe(403);
    await expect(greet.orThrow({ name: "forbidden" })).rejects.toThrow(
      "Name not allowed",
    );

    // FormData action with validator
    const subscribeForm = defineAction({
      accept: "form",
      input: (raw: unknown) => {
        const data = raw as { email?: unknown; tags?: unknown };
        if (typeof data.email !== "string" || !data.email.includes("@")) {
          throw new ActionInputError([
            { path: ["email"], message: "Valid email required" },
          ]);
        }
        const tags = Array.isArray(data.tags)
          ? data.tags.map(String)
          : data.tags
            ? [String(data.tags)]
            : [];
        return { email: data.email, tags };
      },
      handler: (input) => ({
        subscribed: input.email,
        count: input.tags.length,
      }),
    });

    const form = new FormData();
    form.append("email", "ada@example.com");
    form.append("tags", "news");
    form.append("tags", "releases");

    const formResult = await subscribeForm(form);
    expect(formResult).toEqual({
      data: { subscribed: "ada@example.com", count: 2 },
      error: undefined,
    });

    const invalidForm = new FormData();
    invalidForm.append("email", "invalid");
    const invalidFormRes = await subscribeForm(invalidForm);
    expect(isInputError(invalidFormRes.error)).toBe(true);
  });
});

describe("@tschk/moonshine-astro/transitions", () => {
  test("fade, slide, none, createAnimationScope, and transition generate scoped View Transition descriptors", () => {
    const f = fade({ duration: 150 });
    expect(f.forwards.old).toMatchObject({
      name: "astroFadeOut",
      duration: 150,
    });
    expect(f.forwards.new).toMatchObject({
      name: "astroFadeIn",
      duration: 150,
    });

    const s = slide({ duration: "250ms" });
    expect(Array.isArray(s.forwards.old)).toBe(true);
    expect(Array.isArray(s.forwards.new)).toBe(true);

    const n = none();
    expect(n.forwards.old).toMatchObject({ name: "none", duration: 0 });

    const scope = createAnimationScope("hero-card", f, "astro-hero-1");
    expect(scope.scope).toBe("astro-hero-1");
    expect(scope.attributes).toEqual({
      "data-astro-transition-scope": "astro-hero-1",
    });
    expect(scope.styles).toContain(
      '[data-astro-transition-scope="astro-hero-1"] { view-transition-name: astro-hero-1; }',
    );
    expect(scope.styles).toContain("::view-transition-old(astro-hero-1)");
    expect(scope.styles).toContain("150ms");

    const attrs = transition({ name: "header", animate: "slide" });
    expect(attrs["data-astro-transition-scope"]).toMatch(/^astro-header-\d+$/);
  });

  test("navigate dispatches Astro transition lifecycle events and swapFunctions update DOM state", async () => {
    expect(typeof supportsViewTransitions).toBe("boolean");
    expect(isTransitionEnabled()).toBe(false);

    const events: string[] = [];
    const onBeforePrep = () => events.push(TRANSITION_BEFORE_PREPARATION);
    const onAfterPrep = () => events.push(TRANSITION_AFTER_PREPARATION);
    const onBeforeSwap = () => events.push(TRANSITION_BEFORE_SWAP);
    const onAfterSwap = () => events.push(TRANSITION_AFTER_SWAP);
    const onPageLoad = () => events.push(TRANSITION_PAGE_LOAD);

    document.addEventListener(TRANSITION_BEFORE_PREPARATION, onBeforePrep);
    document.addEventListener(TRANSITION_AFTER_PREPARATION, onAfterPrep);
    document.addEventListener(TRANSITION_BEFORE_SWAP, onBeforeSwap);
    document.addEventListener(TRANSITION_AFTER_SWAP, onAfterSwap);
    document.addEventListener(TRANSITION_PAGE_LOAD, onPageLoad);

    try {
      await navigate("/next-page?x=1", { history: "push", state: { step: 2 } });
      expect(events).toEqual([
        TRANSITION_BEFORE_PREPARATION,
        TRANSITION_AFTER_PREPARATION,
        TRANSITION_BEFORE_SWAP,
        TRANSITION_AFTER_SWAP,
        TRANSITION_PAGE_LOAD,
      ]);
    } finally {
      window.history?.replaceState?.({}, "", "/");
      document.removeEventListener(TRANSITION_BEFORE_PREPARATION, onBeforePrep);
      document.removeEventListener(TRANSITION_AFTER_PREPARATION, onAfterPrep);
      document.removeEventListener(TRANSITION_BEFORE_SWAP, onBeforeSwap);
      document.removeEventListener(TRANSITION_AFTER_SWAP, onAfterSwap);
      document.removeEventListener(TRANSITION_PAGE_LOAD, onPageLoad);
    }

    const incoming =
      document.implementation.createHTMLDocument("Incoming Title");
    incoming.title = "Incoming Title";
    incoming.documentElement.setAttribute("lang", "fr");
    try {
      swapFunctions.swapHeadElements(incoming);
      swapFunctions.swapRootAttributes(incoming);
      expect(document.title).toBe("Incoming Title");
      expect(document.documentElement.getAttribute("lang")).toBe("fr");
    } finally {
      document.head.replaceChildren();
      document.documentElement.removeAttribute("lang");
    }

    expect(ViewTransitions).toBe(ClientRouter);
    const defaultRouter = renderToString(() => h(ClientRouter, {}));
    expect(defaultRouter).toBe(
      '<meta name="astro-view-transitions-enabled" content="true"><meta name="astro-view-transitions-fallback" content="animate">',
    );
    const customRouter = renderToString(() =>
      h(ViewTransitions, { fallback: "swap", handleForms: false }),
    );
    expect(customRouter).toBe(
      '<meta name="astro-view-transitions-enabled" content="true"><meta name="astro-view-transitions-fallback" content="swap"><meta name="astro-view-transitions-forms" content="false">',
    );
  });
});

describe("@tschk/moonshine-astro/context session, routePattern, callAction, and getActionResult", () => {
  test("AstroSession persists values across requests with matching session cookie, supports regenerate() and destroy()", async () => {
    clearAstroSessions();
    const first = createAstroGlobal({
      url: "https://example.com/cart",
      routePattern: "/cart/[id]",
    });
    expect(first.routePattern).toBe("/cart/[id]");
    expect(first.session).toBeInstanceOf(AstroSession);

    first.session.set("cart", ["apple", "banana"]);
    expect(await first.session.has("cart")).toBe(true);
    expect(await first.session.get<string[]>("cart")).toEqual([
      "apple",
      "banana",
    ]);
    expect(await first.session.keys()).toEqual(["cart"]);

    const setCookieHeaders = Array.from(first.cookies.headers());
    expect(setCookieHeaders.some((h) => h.startsWith("astro-session="))).toBe(
      true,
    );
    const sid = first.session.sessionID;

    const second = createAstroGlobal({
      request: new Request("https://example.com/checkout", {
        headers: { cookie: `astro-session=${sid}` },
      }),
    });
    expect(await second.session.get<string[]>("cart")).toEqual([
      "apple",
      "banana",
    ]);

    await second.session.regenerate();
    expect(second.session.sessionID).not.toBe(sid);
    expect(await second.session.get<string[]>("cart")).toEqual([
      "apple",
      "banana",
    ]);

    second.session.destroy();
    expect(await second.session.entries()).toEqual({});
  });

  test("Astro.callAction, Astro.getActionResult, getActionContext, serializeActionResult, and deserializeActionResult", async () => {
    const increment = defineAction({
      name: "counter.increment",
      handler: (step: number = 1, ctx) => {
        ctx.session.set("lastStep", step);
        return { count: step + 10, route: ctx.routePattern };
      },
    });

    await withAstroContext({ routePattern: "/counter" }, async () => {
      const astro = useAstro();
      expect(astro.getActionResult(increment)).toBeUndefined();
      const res = await astro.callAction(increment, 5);
      expect(res).toEqual({
        data: { count: 15, route: "/counter" },
        error: undefined,
      });
      expect(astro.getActionResult(increment)).toEqual({
        data: { count: 15, route: "/counter" },
        error: undefined,
      });
      expect(await astro.session.get("lastStep")).toBe(5);
    });

    const serializedData = serializeActionResult({
      data: { ok: true },
      error: undefined,
    });
    expect(serializedData.type).toBe("data");
    expect(deserializeActionResult(serializedData)).toEqual({
      data: { ok: true },
      error: undefined,
    });

    const serializedEmpty = serializeActionResult({
      data: undefined,
      error: undefined,
    });
    expect(serializedEmpty).toEqual({ type: "empty", status: 204 });
    expect(deserializeActionResult(serializedEmpty)).toEqual({
      data: undefined,
      error: undefined,
    });

    const serializedErr = serializeActionResult({
      data: undefined,
      error: new ActionInputError([{ path: ["email"], message: "Invalid" }]),
    });
    expect(serializedErr.type).toBe("error");
    const deserializedErr = deserializeActionResult(serializedErr);
    expect(isInputError(deserializedErr.error)).toBe(true);

    // Middleware getActionContext for incoming POST form action
    await withAstroContext(
      {
        request: new Request(
          "https://example.com/counter?_action=counter.increment",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(7),
          },
        ),
        routePattern: "/counter",
      },
      async () => {
        const actionCtx = getActionContext();
        expect(actionCtx.action?.name).toBe("counter.increment");
        expect(actionCtx.action?.calledFrom).toBe("form");
        const handlerResult = await actionCtx.action!.handler();
        actionCtx.setActionResult(
          actionCtx.action!.name,
          actionCtx.serializeActionResult(handlerResult),
        );
        expect(useAstro().getActionResult(increment)).toEqual({
          data: { count: 17, route: "/counter" },
          error: undefined,
        });
      },
    );
  });
});

describe("@tschk/moonshine-astro/config", () => {
  test("defineConfig, mergeConfig, validateConfig, and image service helpers", async () => {
    const raw = defineConfig({
      site: "https://example.com",
      base: "/docs",
      output: "server",
      image: {
        service: passthroughImageService(),
        domains: ["cdn.example.com"],
      },
      env: {
        schema: {
          API_URL: envField.string({ context: "server", access: "public" }),
        },
      },
    });
    expect(raw.base).toBe("/docs");
    expect(sharpImageService({ limitInputPixels: false }).entrypoint).toBe(
      "astro/assets/services/sharp",
    );
    expect(squooshImageService().entrypoint).toBe(
      "astro/assets/services/squoosh",
    );

    const merged = mergeConfig(
      {
        base: "/",
        integrations: [{ name: "one", hooks: {} }],
        vite: { define: { A: "1" } },
      },
      {
        base: "/app",
        integrations: [{ name: "two", hooks: {} }],
        vite: { define: { B: "2" } },
      },
    );
    expect(merged.base).toBe("/app");
    expect(merged.integrations.map((i) => i.name)).toEqual(["one", "two"]);
    expect(merged.vite.define).toEqual({ A: "1", B: "2" });

    const validated = await validateConfig(raw, "/workspace/project");
    expect(validated.root.href).toBe("file:///workspace/project/");
    expect(validated.srcDir.href).toBe("file:///workspace/project/src/");
    expect(validated.outDir.href).toBe("file:///workspace/project/dist/");
    expect(validated.image?.service?.entrypoint).toBe(
      "astro/assets/services/noop",
    );
  });
});
