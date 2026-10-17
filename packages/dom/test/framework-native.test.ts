import { head, title } from "../src/head-ssr";
import { expect, test } from "bun:test";
import type { RenderContext } from "@tschk/moonshine-framework";
import { createNativeRenderer } from "../src/framework-native";
import { h, defer, onCleanup } from "../src/ssr";
import { getContext, setContext } from "../src/component";

function context(
  mode: "static" | "ssr" | "spa" | "island" = "ssr",
): RenderContext {
  return {
    request: new Request("https://example.com/account"),
    route: {
      id: "account",
      path: "/account",
      file: "/relocated/account.ts",
      layouts: ["/relocated/layout.ts"],
      mode,
      runtime: "bun",
      decision: "test",
      clientEntries: [],
    },
    params: { name: "alice" },
    data: { name: "<alice>" },
    signal: new AbortController().signal,
  };
}

test("layouts initialize outside their lazy children and provide request-local context", async () => {
  const initialized: string[] = [];
  let destroyed = 0;
  const renderer = createNativeRenderer({
    account: {
      default: () => {
        initialized.push("page");
        onCleanup(() => destroyed++);
        return h("p", null, getContext<string>("request"));
      },
    },
    "/relocated/layout.ts": {
      default: ({ params, children }) => {
        initialized.push("layout");
        setContext("request", params.name);
        onCleanup(() => destroyed++);
        return h("main", null, children);
      },
    },
  });
  const first = context();
  expect(await renderer.prerender(first)).toContain(
    "<main><p>alice</p></main>",
  );
  const second = context();
  second.params.name = "bob";
  expect(await renderer.prerender(second)).toContain("<main><p>bob</p></main>");
  expect(initialized).toEqual(["layout", "page", "layout", "page"]);
  expect(destroyed).toBe(4);
});

test.each(["module", "component"])(
  "reused %s HTML factories attach deferred components to each current request",
  async (mode) => {
    let destroyed = 0;
    function Child() {
      onCleanup(() => destroyed++);
      return h("p", null, getContext<string>("request"));
    }
    const build = () =>
      h(
        "section",
        null,
        defer(() => h(Child, {})),
      );
    let cached = mode === "module" ? build() : undefined;
    const renderer = createNativeRenderer({
      account: { default: () => (cached ??= build()) },
      "/relocated/layout.ts": {
        default: ({ params, children }) => {
          setContext("request", params.name);
          return h("main", null, children);
        },
      },
    });
    const request = context();
    expect(await renderer.prerender(request)).toContain(
      "<section><p>alice</p></section>",
    );
    request.params.name = "bob";
    expect(await renderer.prerender(request)).toContain(
      "<section><p>bob</p></section>",
    );
    expect(destroyed).toBe(2);
  },
);

test("prototype-named route IDs use own module and layout registrations", async () => {
  for (const id of ["__proto__", "constructor", "toString"]) {
    const ctx = context();
    ctx.route.id = id;
    const renderer = createNativeRenderer({
      [ctx.route.file]: { default: () => h("p", null, "own page") },
      [ctx.route.layouts![0]!]: {
        default: ({ children }) => h("main", null, children),
      },
    });
    expect(await renderer.prerender(ctx)).toContain(
      "<main><p>own page</p></main>",
    );
  }
});

test("native renderer uses bundled pages and canonical layouts after relocation", async () => {
  let cleanups = 0;
  const renderer = createNativeRenderer(
    {
      account: {
        default: ({ params, data }) => {
          onCleanup(() => {
            cleanups++;
          });
          return h("p", null, params.name, (data as { name: string }).name);
        },
      },
      "/original/layout.ts": {
        default: ({ children }) => h("main", null, children),
      },
    },
    { account: ["/original/layout.ts"] },
  );
  const html = await renderer.prerender(context("static"));
  expect(html).toContain("<main><p>alice&lt;alice&gt;</p></main>");
  expect(html).not.toContain("<script");
  expect(cleanups).toBe(1);
  const response = await renderer.render(context());
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(await response.text()).toBe(html);
  expect(cleanups).toBe(2);
});

test("native SPA emits escaped props and a shell without running the server page", async () => {
  const renderer = createNativeRenderer({
    account: {
      default: () => {
        throw Error("should not run");
      },
    },
  });
  const ctx = context("spa");
  ctx.route.clientEntries = ['/client.js?quote="'];
  ctx.route.clientStyles = ['/client.css?quote="&'];
  ctx.data = { value: '</script><img src=x onerror="alert(1)">\u2028' };
  const html = await renderer.prerender(ctx);
  expect(html).toContain('data-moonshine-app="account"');
  expect(html).toContain('src="/client.js?quote=&quot;"');
  expect(html).toContain(
    '<link rel="stylesheet" href="/client.css?quote=&quot;&amp;">',
  );
  const payload = html.match(/data-moonshine-props>(.*?)<\/script>/s)![1]!;
  expect(payload).not.toContain("<");
  expect(JSON.parse(payload)).toEqual({ params: ctx.params, data: ctx.data });
  expect(html.match(/<script/g)).toHaveLength(2);
});

test("native rendering refuses missing modules, unbootstrapped SPA and unsupported hydration", async () => {
  const renderer = createNativeRenderer({});
  expect(renderer.render(context())).rejects.toThrow(
    "Missing native component",
  );
  expect(renderer.render(context("spa"))).rejects.toThrow(
    "requires a client entry",
  );
  expect(renderer.render(context("island"))).rejects.toThrow(
    "hydration is not implemented",
  );
});

test("native metadata merges canonical layouts then page with escaped request data", async () => {
  const renderer = createNativeRenderer(
    {
      outer: {
        default: ({ children }) => children,
        metadata: { title: "outer", description: "layout", lang: "fr" },
      },
      inner: {
        default: ({ children }) => children,
        metadata: { title: "inner" },
      },
      account: {
        default: () => h("p", null, "body"),
        metadata: (ctx) => ({
          title: `${ctx.params.name}</title>`,
          description: (ctx.data as { name: string }).name,
          lang: 'x"&',
        }),
      },
    },
    { account: ["outer", "inner"] },
  );
  const contexts = [context(), context("static")];
  contexts[1]!.params.name = "bob";
  const [alice, bob] = await Promise.all(
    contexts.map((ctx) => renderer.prerender(ctx)),
  );
  expect(alice).toContain('<html lang="x&quot;&amp;">');
  expect(alice).toContain("<title>alice&lt;/title&gt;</title>");
  expect(alice).toContain('<meta name="description" content="&lt;alice&gt;">');
  expect(bob).toContain("<title>bob&lt;/title&gt;</title>");
  expect(bob).not.toContain("alice&lt;/title");
});

test("metadata fields inherit individually and null explicitly clears", async () => {
  const renderer = createNativeRenderer(
    {
      outer: {
        default: ({ children }) => children,
        metadata: { title: "outer", description: "inherited", lang: "fr" },
      },
      inner: {
        default: ({ children }) => children,
        metadata: { title: "inner", description: undefined },
      },
      account: {
        default: () => "",
        metadata: { title: undefined, lang: null },
      },
    },
    { account: ["outer", "inner"] },
  );
  const html = await renderer.prerender(context());
  expect(html).toContain("<html><head>");
  expect(html).toContain("<title>inner</title>");
  expect(html).toContain('content="inherited"');
  const cleared = createNativeRenderer(
    {
      account: {
        default: () => "",
        metadata: { title: null, description: null },
      },
      outer: {
        metadata: { title: "outer", description: "outer" },
        default: ({ children }) => children,
      },
    },
    { account: ["outer"] },
  );
  expect(await cleared.prerender(context())).not.toContain("<title>");
  expect(await cleared.prerender(context())).not.toContain(
    'name="description"',
  );
});

test("SPA metadata runs without mounting components; API bypasses it", async () => {
  let calls = 0;
  const renderer = createNativeRenderer({
    account: {
      default: () => {
        throw Error("mounted");
      },
      metadata: () => {
        calls++;
        return { title: "counter" };
      },
    },
  });
  const ctx = context("spa");
  ctx.route.clientEntries = ["/client.js"];
  expect(await renderer.prerender(ctx)).toContain("<title>counter</title>");
  ctx.route.mode = "api";
  expect(await (await renderer.render(ctx)).json()).toEqual(ctx.data);
  expect(await renderer.prerender(ctx)).toBe(JSON.stringify(ctx.data));
  expect(calls).toBe(1);
});

test("native metadata rejects async and invalid values", async () => {
  for (const metadata of [
    null,
    [],
    Promise.resolve({ title: "bad" }),
    () => Promise.resolve({ title: "bad" }),
    { title: 1 },
    { description: false },
    { lang: {} },
  ]) {
    const renderer = createNativeRenderer({
      account: { default: () => "", metadata: metadata as never },
    });
    await expect(renderer.prerender(context())).rejects.toThrow(/metadata/);
  }
});

test("absent native metadata preserves the default document exactly", async () => {
  const ctx = context();
  ctx.route.layouts = [];
  expect(
    await createNativeRenderer({
      account: { default: () => "body" },
    }).prerender(ctx),
  ).toBe(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>body</body></html>',
  );
});

test("unsupported asynchronous metadata observes rejected promises", async () => {
  const rejected = Promise.reject(new Error("rejected metadata export"));
  const renderer = createNativeRenderer({
    account: { default: () => "", metadata: rejected as never },
  });
  await expect(renderer.prerender(context())).rejects.toThrow(
    "synchronous object",
  );
  const asynchronous = createNativeRenderer({
    account: {
      default: () => "",
      metadata: (async () => {
        await Promise.resolve();
        throw new Error("rejected async metadata callback");
      }) as never,
    },
  });
  await expect(asynchronous.prerender(context())).rejects.toThrow(
    "synchronous object",
  );
  const throwingGetter = createNativeRenderer({
    account: {
      default: () => "",
      metadata: {
        // oxlint-disable-next-line unicorn/no-thenable -- adversarial invalid metadata fixture
        get then() {
          throw new Error("getter");
        },
      } as never,
    },
  });
  await expect(throwingGetter.prerender(context())).rejects.toThrow(
    "synchronous object",
  );
  // Give delayed callback rejections a turn to surface as test-runner failures.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("component head overrides metadata title and stays request-local", async () => {
  const renderer = createNativeRenderer({
    account: {
      metadata: { title: "server default", description: "default description" },
      default: ({ params }) => {
        head(() => [
          title(() => "Page:" + params.name),
          h("meta", { name: "description", content: params.name }),
        ]);
        return h("p", null, params.name);
      },
    },
    "/relocated/layout.ts": {
      default: ({ children }) => h("main", null, children),
    },
  });
  for (const name of ["<alice>", "bob"]) {
    const ctx = context();
    ctx.params.name = name;
    const html = await renderer.prerender(ctx);
    const escaped = name === "<alice>" ? "&lt;alice&gt;" : name;
    expect(html).toContain("<title>Page:" + escaped + "</title>");
    expect(html.match(/<title>/g)?.length).toBe(1);
    expect(html).not.toContain("server default");
    expect(html).toContain(
      '<meta name="description" content="default description">',
    );
    expect(html).toContain(
      '<meta name="description" content="' + escaped + '">',
    );
    const body = html.slice(html.indexOf("<body>"));
    expect(body).not.toContain("<meta");
    expect(body).not.toContain("<title");
  }
});
