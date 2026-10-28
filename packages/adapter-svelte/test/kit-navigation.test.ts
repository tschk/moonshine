import { beforeEach, describe, expect, test } from "bun:test";
import { createEffect, createRoot } from "@tschk/moonshine-dom/reactive";
import { get } from "../src/store";
import {
  afterNavigate,
  applyAction,
  asset,
  assets,
  base,
  beforeNavigate,
  browser,
  building,
  configureKitEnvironment,
  configureKitPaths,
  deserialize,
  dev,
  disableScrollHandling,
  enhance,
  getPreloadedCodeUrls,
  getStores,
  goto,
  invalidate,
  invalidateAll,
  isScrollHandlingDisabled,
  navigating,
  onNavigate,
  page,
  preloadCode,
  preloadData,
  pushState,
  registerKitRoutes,
  replaceState,
  resetKitNavigation,
  resolve,
  resolveRoute,
  setKitPage,
  setKitUpdated,
  setKitVersionChecker,
  updated,
  version,
} from "../src/navigation";
import {
  ActionFailure,
  build,
  clearKitServerAssets,
  command,
  configureKitEnv,
  configureKitServiceWorker,
  createKitCookies,
  createKitRequestEvent,
  createLoadEvent,
  createServerLoadEvent,
  env,
  error,
  executeKitAction,
  executeKitServerLoad,
  executeKitUniversalLoad,
  fail,
  files,
  form,
  getRequestEvent,
  HttpError,
  isActionFailure,
  isHttpError,
  isRedirect,
  json,
  normalizeUrl,
  prerender,
  prerendered,
  privateEnv,
  publicEnv,
  query,
  read,
  Redirect,
  redirect,
  registerKitServerAsset,
  resetKitEnv,
  resetKitServiceWorker,
  resolvePath,
  sequence,
  text,
  VERSION,
  withKitRequestEvent,
  type Actions,
  type PageLoad,
  type PageServerLoad,
  type RequestHandler,
} from "../src/kit";

describe("@tschk/moonshine-svelte/navigation & @tschk/moonshine-svelte/kit", () => {
  beforeEach(() => {
    resetKitNavigation("http://localhost/");
    configureKitPaths({ base: "", assets: "" });
    configureKitEnvironment({
      browser: false,
      dev: false,
      building: false,
      version: "0.4.68",
    });
  });

  test("page exposes reactive $app/state getters and $app/stores Readable contract", () => {
    const snapshots: string[] = [];
    const unsubscribe = page.subscribe((p) => {
      snapshots.push(`${p.url.pathname}:${p.status}:${p.data.title ?? "none"}`);
    });

    const effectTraces: string[] = [];
    const dispose = createRoot((stop) => {
      createEffect(() => {
        effectTraces.push(
          `${page.url.pathname}|${page.params.slug ?? "-"}|${page.data.title ?? "-"}`,
        );
      });
      return stop;
    });

    expect(snapshots).toEqual(["/:200:none"]);
    expect(effectTraces).toEqual(["/|-|-"]);

    setKitPage({
      url: "http://localhost/blog/hello",
      params: { slug: "hello" },
      route: "/blog/[slug]",
      status: 200,
      data: { title: "Hello World" },
    });

    expect(get(page).url.pathname).toBe("/blog/hello");
    expect(page.params).toEqual({ slug: "hello" });
    expect(page.route.id).toBe("/blog/[slug]");
    expect(snapshots).toEqual(["/:200:none", "/blog/hello:200:Hello World"]);
    expect(effectTraces).toEqual(["/|-|-", "/blog/hello|hello|Hello World"]);

    const stores = getStores();
    expect(stores.page).toBe(page);
    expect(stores.navigating).toBe(navigating);
    expect(stores.updated).toBe(updated);

    unsubscribe();
    dispose();
  });

  test("goto, route matching, beforeNavigate, onNavigate, afterNavigate, and navigating state", async () => {
    let loadCalls = 0;
    registerKitRoutes([
      {
        id: "/(marketing)/posts/[id]/[[tab]]",
        async load({ params, depends }) {
          loadCalls++;
          depends("app:posts");
          return {
            postId: params.id,
            tab: params.tab ?? "overview",
            loadCalls,
          };
        },
      },
    ]);

    const lifecycle: string[] = [];
    const navStates: Array<string | null> = [];
    const unsubNav = navigating.subscribe((n) => {
      navStates.push(
        n ? `${n.from?.url.pathname}->${n.to?.url.pathname}` : null,
      );
    });

    let blockNavigation = false;
    const dispose = createRoot((stop) => {
      beforeNavigate((nav) => {
        lifecycle.push(`before:${nav.to?.url.pathname}`);
        if (blockNavigation) nav.cancel();
      });
      onNavigate((nav) => {
        lifecycle.push(`on:${nav.to?.url.pathname}`);
        return () => {
          lifecycle.push(`onCleanup:${nav.to?.url.pathname}`);
        };
      });
      afterNavigate((nav) => {
        lifecycle.push(`after:${nav.to?.url.pathname}`);
      });
      return stop;
    });

    // Cancelled navigation
    blockNavigation = true;
    await goto("/posts/42/comments");
    expect(page.url.pathname).toBe("/");
    expect(lifecycle).toEqual(["before:/posts/42/comments"]);

    // Allowed navigation
    blockNavigation = false;
    await goto("/posts/42/comments", { state: { scrollY: 120 } });
    expect(page.url.pathname).toBe("/posts/42/comments");
    expect(page.route.id).toBe("/(marketing)/posts/[id]/[[tab]]");
    expect(page.params).toEqual({ id: "42", tab: "comments" });
    expect(page.data).toEqual({
      postId: "42",
      tab: "comments",
      loadCalls: 1,
    });
    expect(page.state).toEqual({ scrollY: 120 });
    expect(navigating.current).toBeNull();
    expect(navigating.to).toBeNull();
    expect(navStates).toEqual([null, "/->/posts/42/comments", null]);
    expect(lifecycle).toEqual([
      "before:/posts/42/comments",
      "before:/posts/42/comments",
      "on:/posts/42/comments",
      "onCleanup:/posts/42/comments",
      "after:/posts/42/comments",
    ]);

    // Invalidation via dependency identifier & predicate
    await invalidate("app:posts");
    expect(page.data.loadCalls).toBe(2);

    await invalidate((u) => u.pathname.startsWith("/posts/"));
    expect(page.data.loadCalls).toBe(3);

    await invalidateAll();
    expect(page.data.loadCalls).toBe(4);

    // preloadData & preloadCode
    const preloaded = await preloadData("/posts/99");
    expect(preloaded).toEqual({
      type: "loaded",
      status: 200,
      data: {
        postId: "99",
        tab: "overview",
        loadCalls: 5,
      },
    });

    await preloadCode("/posts/99", "/about");
    expect(Array.from(getPreloadedCodeUrls())).toEqual(["/posts/99", "/about"]);

    // Shallow routing pushState / replaceState & disableScrollHandling
    pushState("/posts/42/settings", { modal: true });
    expect(page.url.pathname).toBe("/posts/42/settings");
    expect(page.state).toEqual({ modal: true });

    replaceState("", { modal: false });
    expect(page.url.pathname).toBe("/posts/42/settings");
    expect(page.state).toEqual({ modal: false });

    expect(isScrollHandlingDisabled()).toBe(false);
    disableScrollHandling();
    expect(isScrollHandlingDisabled()).toBe(true);

    unsubNav();
    dispose();
  });

  test("updated state, paths helpers, and environment configuration", async () => {
    expect(updated.current).toBe(false);
    expect(get(updated)).toBe(false);

    setKitVersionChecker(async () => true);
    const changed = await updated.check();
    expect(changed).toBe(true);
    expect(updated.current).toBe(true);
    expect(get(updated)).toBe(true);

    setKitUpdated(false);
    expect(updated.current).toBe(false);

    configureKitPaths({ base: "/docs", assets: "https://cdn.example.com" });
    expect(base).toBe("/docs");
    expect(assets).toBe("https://cdn.example.com");
    expect(
      resolveRoute("/(group)/blog/[slug]/[[lang]]", {
        slug: "moonshine",
        lang: "en",
      }),
    ).toBe("/docs/blog/moonshine/en");
    expect(
      resolveRoute("/files/[...rest]", {
        rest: "a/b/c",
      }),
    ).toBe("/docs/files/a/b/c");
    expect(resolve("/about")).toBe("/docs/about");
    expect(asset("logo.svg")).toBe("https://cdn.example.com/logo.svg");
    expect(resolvePath("/users/[id]", { id: "7" })).toBe("/docs/users/7");

    configureKitEnvironment({
      browser: true,
      dev: true,
      building: false,
      version: "1.2.3",
    });
    expect(browser).toBe(true);
    expect(dev).toBe(true);
    expect(building).toBe(false);
    expect(version).toBe("1.2.3");
  });

  test("$app/forms deserialize, applyAction, and progressive enhance", async () => {
    const deserialized = deserialize<{ saved: boolean }>(
      JSON.stringify({
        type: "success",
        status: 200,
        data: { saved: true },
      }),
    );
    expect(deserialized).toEqual({
      type: "success",
      status: 200,
      data: { saved: true },
    });

    await applyAction(deserialized);
    expect(page.status).toBe(200);
    expect(page.form).toEqual({ saved: true });

    await applyAction({
      type: "failure",
      status: 422,
      data: { field: "invalid" },
    });
    expect(page.status).toBe(422);
    expect(page.form).toEqual({ field: "invalid" });

    await applyAction({
      type: "error",
      status: 500,
      error: "Database offline",
    });
    expect(page.status).toBe(500);
    expect(page.error).toEqual({ message: "Database offline" });

    // Progressive enhance with synthetic form element
    const listeners = new Map<string, EventListener>();
    let resetCalled = false;
    const fakeForm = {
      getAttribute(attr: string) {
        return attr === "action" ? "http://localhost/contact" : null;
      },
      addEventListener(type: string, cb: EventListener) {
        listeners.set(type, cb);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
      reset() {
        resetCalled = true;
      },
    } as unknown as HTMLFormElement;

    const originalFetch = globalThis.fetch;
    const originalFormData = globalThis.FormData;
    class MockFormData {
      entries = new Map<string, string>();
      append(k: string, v: string) {
        this.entries.set(k, v);
      }
    }
    globalThis.FormData = MockFormData as unknown as typeof FormData;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          type: "success",
          status: 201,
          data: { ok: true },
        }),
      )) as unknown as typeof fetch;

    try {
      let callbackResultStatus = 0;
      const actionHandle = enhance(fakeForm, ({ action }) => {
        expect(action.pathname).toBe("/contact");
        return async ({ result, update }) => {
          callbackResultStatus = result.status ?? 0;
          await update();
        };
      });

      let defaultPrevented = false;
      const submitHandler = listeners.get("submit")!;
      await (submitHandler as unknown as (e: any) => Promise<void>)({
        preventDefault() {
          defaultPrevented = true;
        },
        submitter: {
          name: "intent",
          value: "save",
          getAttribute: () => null,
        },
      });

      expect(defaultPrevented).toBe(true);
      expect(callbackResultStatus).toBe(201);
      expect(resetCalled).toBe(true);
      expect(page.status).toBe(201);
      expect(page.form).toEqual({ ok: true });

      actionHandle.destroy();
      expect(listeners.has("submit")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.FormData = originalFormData;
    }
  });

  test("@sveltejs/kit error, redirect, fail, json, text, normalizeUrl, cookies, and sequence", async () => {
    expect(typeof VERSION).toBe("string");

    // error & isHttpError
    let caughtError: unknown;
    try {
      error(404, "Page not found");
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(HttpError);
    expect(isHttpError(caughtError)).toBe(true);
    expect(isHttpError(caughtError, 404)).toBe(true);
    expect(isHttpError(caughtError, 500)).toBe(false);

    // redirect & isRedirect
    let caughtRedirect: unknown;
    try {
      redirect(303, "/login");
    } catch (e) {
      caughtRedirect = e;
    }
    expect(caughtRedirect).toBeInstanceOf(Redirect);
    expect(isRedirect(caughtRedirect)).toBe(true);
    expect((caughtRedirect as Redirect).location).toBe("/login");

    // fail & isActionFailure
    const failure = fail(400, { email: "Required" });
    expect(failure).toBeInstanceOf(ActionFailure);
    expect(isActionFailure(failure)).toBe(true);
    expect(failure.status).toBe(400);
    expect(failure.data).toEqual({ email: "Required" });

    // json & text responses
    const jsonRes = json({ hello: "world" }, { status: 201 });
    expect(jsonRes.status).toBe(201);
    expect(jsonRes.headers.get("content-type")).toBe("application/json");
    expect(await jsonRes.json()).toEqual({ hello: "world" });

    const textRes = text("plain output");
    expect(textRes.headers.get("content-type")).toBe(
      "text/plain;charset=utf-8",
    );
    expect(await textRes.text()).toBe("plain output");

    // normalizeUrl
    const norm = normalizeUrl("http://localhost/docs//guide/");
    expect(norm.wasNormalized).toBe(true);
    expect(norm.url.pathname).toBe("/docs/guide");
    expect(norm.denormalize().pathname).toBe("/docs/guide/");

    // Cookies & RequestEvent
    const reqHeaders = new Headers({ cookie: "session=abc123; theme=dark" });
    const resHeaders = new Headers();
    const cookies = createKitCookies(reqHeaders, resHeaders);
    expect(cookies.get("session")).toBe("abc123");
    expect(cookies.getAll()).toEqual([
      { name: "session", value: "abc123" },
      { name: "theme", value: "dark" },
    ]);
    cookies.set("theme", "light", { path: "/", sameSite: "lax" });
    expect(cookies.get("theme")).toBe("light");
    expect(resHeaders.get("set-cookie")).toContain(
      "theme=light; Path=/; HttpOnly; SameSite=Lax",
    );
    cookies.delete("session", { path: "/" });
    expect(cookies.get("session")).toBeUndefined();

    // sequence middleware
    const trace: string[] = [];
    const combined = sequence(
      async ({ event, resolve: next }) => {
        trace.push("first:in");
        event.locals.user = "ada";
        const response = await next(event, {
          transformPageChunk: ({ html }) => html.replace("BODY", "FIRST(BODY)"),
        });
        trace.push("first:out");
        return response;
      },
      async ({ event, resolve: next }) => {
        trace.push(`second:${event.locals.user}`);
        return next(event, {
          transformPageChunk: ({ html }) => html.replace("BODY", "SECOND"),
        });
      },
    );

    const reqEvent = createKitRequestEvent({
      url: "http://localhost/dashboard",
    });
    const finalRes = await combined({
      event: reqEvent,
      resolve: async (_ev, opts) => {
        const html =
          (await opts?.transformPageChunk?.({
            html: "<main>BODY</main>",
            done: true,
          })) ?? "<main>BODY</main>";
        return text(html);
      },
    });
    expect(await finalRes.text()).toBe("<main>FIRST(SECOND)</main>");
    expect(trace).toEqual(["first:in", "second:ada", "first:out"]);
  });

  test("SvelteKit $env/* (publicEnv, privateEnv, env) and $service-worker (build, files, prerendered, version, base)", () => {
    resetKitEnv();
    resetKitServiceWorker();

    configureKitEnv({
      env: {
        PUBLIC_API_URL: "https://api.example.com",
        PUBLIC_APP_NAME: "Moonshine",
        SECRET_TOKEN: "s3cr3t",
      },
    });

    expect(env.PUBLIC_API_URL).toBe("https://api.example.com");
    expect(publicEnv.PUBLIC_APP_NAME).toBe("Moonshine");
    expect(publicEnv.SECRET_TOKEN).toBeUndefined();
    expect("PUBLIC_API_URL" in publicEnv).toBe(true);
    expect("SECRET_TOKEN" in publicEnv).toBe(false);
    expect(Object.keys(publicEnv).sort()).toEqual([
      "PUBLIC_API_URL",
      "PUBLIC_APP_NAME",
    ]);

    expect(privateEnv.SECRET_TOKEN).toBe("s3cr3t");
    expect(privateEnv.PUBLIC_API_URL).toBe("https://api.example.com");
    expect("SECRET_TOKEN" in privateEnv).toBe(true);

    configureKitServiceWorker({
      build: ["/_app/immutable/entry.js"],
      files: ["/favicon.png", "/manifest.json"],
      prerendered: ["/", "/about"],
      version: "v2026.10",
      base: "/docs",
    });

    expect(build).toEqual(["/_app/immutable/entry.js"]);
    expect(files).toEqual(["/favicon.png", "/manifest.json"]);
    expect(prerendered).toEqual(["/", "/about"]);

    resetKitServiceWorker();
    expect(build).toEqual([]);
    expect(files).toEqual([]);
    expect(prerendered).toEqual([]);
    resetKitEnv();
  });

  test("$app/server getRequestEvent, withKitRequestEvent, read, and Remote Functions (query, query.batch, prerender, command, form)", async () => {
    clearKitServerAssets();

    expect(() => getRequestEvent()).toThrow(
      /outside of an active RequestEvent/,
    );

    const result = await withKitRequestEvent(
      {
        url: "http://localhost/posts/42",
        params: { id: "42" },
        locals: { user: "grace" },
      },
      async () => {
        const current = getRequestEvent();
        expect(current.url.pathname).toBe("/posts/42");
        expect(current.params.id).toBe("42");
        expect(current.locals.user).toBe("grace");
        return `user:${current.locals.user}`;
      },
    );
    expect(result).toBe("user:grace");
    expect(() => getRequestEvent()).toThrow(
      /outside of an active RequestEvent/,
    );

    // read() asset helper
    registerKitServerAsset("/_app/assets/banner.txt", "Welcome to Moonshine", {
      type: "text/plain",
    });
    const assetRes = read("/_app/assets/banner.txt");
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers.get("content-type")).toBe("text/plain");
    expect(await assetRes.text()).toBe("Welcome to Moonshine");
    clearKitServerAssets();

    // Remote Function: query() with caching, refresh, set, and withOverride
    let fetchCount = 0;
    const getPostTitle = query(
      (slug: unknown) => {
        if (typeof slug !== "string" || !slug) {
          throw new TypeError("Invalid slug");
        }
        return slug;
      },
      async (slug: string) => {
        fetchCount++;
        return `Title:${slug}#${fetchCount}`;
      },
    );

    const handleA = getPostTitle("hello");
    expect(await handleA).toBe("Title:hello#1");
    expect(handleA.current).toBe("Title:hello#1");
    expect(handleA.ready).toBe(true);
    expect(handleA.loading).toBe(false);

    // Cached second call
    expect(await getPostTitle("hello")).toBe("Title:hello#1");
    expect(fetchCount).toBe(1);

    // .refresh() re-runs the query
    await handleA.refresh();
    expect(handleA.current).toBe("Title:hello#2");

    // .set() & .withOverride()
    handleA.set("Custom Title");
    expect(handleA.current).toBe("Custom Title");
    const revert = handleA.withOverride((prev) => `${prev} (optimistic)`);
    expect(handleA.current).toBe("Custom Title (optimistic)");
    revert();
    expect(handleA.current).toBe("Custom Title");

    // query.batch()
    let batchRuns = 0;
    const getUserById = query.batch(async (ids: string[]) => {
      batchRuns++;
      const map = new Map(ids.map((id) => [id, { id, name: `User-${id}` }]));
      return (id: string) => map.get(id)!;
    });
    const [u1, u2] = await Promise.all([getUserById("1"), getUserById("2")]);
    expect(u1).toEqual({ id: "1", name: "User-1" });
    expect(u2).toEqual({ id: "2", name: "User-2" });
    expect(batchRuns).toBe(1);

    // prerender()
    let prerenderCount = 0;
    const getStaticVersion = prerender(() => {
      prerenderCount++;
      return `v1.${prerenderCount}`;
    });
    expect(await getStaticVersion()).toBe("v1.1");
    expect(await getStaticVersion()).toBe("v1.1");
    expect(prerenderCount).toBe(1);

    // command() with .updates()
    const renamePost = command(
      async ({ slug, next }: { slug: string; next: string }) => {
        handleA.set(next);
        return { ok: true, slug };
      },
    );
    const cmdRes = await renamePost({ slug: "hello", next: "Renamed" }).updates(
      handleA,
    );
    expect(cmdRes).toEqual({ ok: true, slug: "hello" });
    expect(getPostTitle.peek("hello")).toBe("Title:hello#3");

    // form()
    const createComment = form(
      {
        parse(raw: Record<string, any>) {
          if (!raw.body) throw new Error("Comment body is required");
          return { body: String(raw.body) };
        },
      },
      async (input) => ({ saved: input.body }),
    );
    expect(createComment.method).toBe("POST");
    expect(createComment.fields.body.name).toBe("body");
    const saved = await createComment({ body: "Nice post!" });
    expect(saved).toEqual({ saved: "Nice post!" });
    expect(createComment.result).toEqual({ saved: "Nice post!" });

    const enriched = createComment.for("comment-1");
    expect(enriched.action).toContain("id=%22comment-1%22");
  });

  test("@sveltejs/kit executeKitServerLoad, executeKitUniversalLoad, executeKitAction, and RequestHandler", async () => {
    const serverLoad: PageServerLoad<
      { slug: string },
      { account: string }
    > = async ({ params, depends, parent, setHeaders, untrack }) => {
      depends("app:post");
      setHeaders({ "cache-control": "max-age=60" });
      const parentData = await parent();
      const untrackedPath = untrack(() => `/posts/${params.slug}`);
      return {
        postSlug: params.slug,
        account: parentData.account,
        path: untrackedPath,
      };
    };

    const serverLoaded = await executeKitServerLoad(serverLoad, {
      url: "http://localhost/posts/svelte-5",
      params: { slug: "svelte-5" },
      parentData: { account: "acme" },
    });

    expect(serverLoaded.data).toEqual({
      postSlug: "svelte-5",
      account: "acme",
      path: "/posts/svelte-5",
    });
    expect(serverLoaded.dependencies).toContain("app:post");
    expect(serverLoaded.event.responseHeaders.get("cache-control")).toBe(
      "max-age=60",
    );

    const universalLoad: PageLoad<{ slug: string }> = async ({
      params,
      data,
      depends,
    }) => {
      depends("app:universal");
      return {
        ...data,
        headline: `Post: ${params.slug}`,
      };
    };

    const universalLoaded = await executeKitUniversalLoad(universalLoad, {
      url: "http://localhost/posts/svelte-5",
      params: { slug: "svelte-5" },
      data: serverLoaded.data,
    });

    expect(universalLoaded.data).toEqual({
      postSlug: "svelte-5",
      account: "acme",
      path: "/posts/svelte-5",
      headline: "Post: svelte-5",
    });
    expect(page.data.headline).toBe("Post: svelte-5");

    // Form Actions execution
    const actions: Actions = {
      save: async ({ request }) => {
        const fd = await request.formData();
        const title = String(fd.get("title") ?? "").trim();
        if (!title) {
          return fail(422, { error: "Title is required" });
        }
        return { savedTitle: title };
      },
      publish: async () => {
        redirect(303, "/published");
      },
    };

    const badFd = new FormData();
    badFd.set("title", "");
    const failedAction = await executeKitAction(actions, "save", {
      url: "http://localhost/posts/svelte-5?/save",
      formData: badFd,
    });
    expect(failedAction.type).toBe("failure");
    expect(failedAction.status).toBe(422);
    expect(page.status).toBe(422);
    expect(page.form).toEqual({ error: "Title is required" });

    const goodFd = new FormData();
    goodFd.set("title", "SvelteKit Native");
    const okAction = await executeKitAction(actions, "save", {
      url: "http://localhost/posts/svelte-5?/save",
      formData: goodFd,
    });
    expect(okAction).toEqual({
      type: "success",
      status: 200,
      data: { savedTitle: "SvelteKit Native" },
    });
    expect(page.form).toEqual({ savedTitle: "SvelteKit Native" });

    const redirectedAction = await executeKitAction(actions, "publish", {
      url: "http://localhost/posts/svelte-5?/publish",
    });
    expect(redirectedAction).toEqual({
      type: "redirect",
      status: 303,
      location: "/published",
    });

    // RequestHandler contract
    const GET: RequestHandler<{ id: string }> = async ({ params }) =>
      json({ item: params.id });
    const getRes = await GET(
      createKitRequestEvent({
        url: "http://localhost/api/items/99",
        params: { id: "99" },
      }),
    );
    expect(await getRes.json()).toEqual({ item: "99" });

    // Direct event factories
    const sle = createServerLoadEvent({ url: "http://localhost/test" });
    expect(sle.url.pathname).toBe("/test");
    const ule = createLoadEvent({ url: "http://localhost/test" });
    expect(ule.url.pathname).toBe("/test");
  });
});
