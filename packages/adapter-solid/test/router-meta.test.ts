import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../../react/test/dom";
import { h as hDOM } from "@tschk/moonshine-dom";
import { createRoot } from "@tschk/moonshine-dom/reactive";
import { h as hSSR, renderToString } from "@tschk/moonshine-dom/ssr";
import {
  Base,
  Link,
  Meta,
  MetaProvider,
  renderTags,
  Style,
  Title,
} from "../src/meta";
import {
  A,
  action,
  createAsync,
  createAsyncStore,
  HashRouter,
  json,
  MemoryRouter,
  Navigate,
  query,
  redirect,
  reload,
  revalidate,
  Route,
  Router,
  Routes,
  StaticRouter,
  useAction,
  useBeforeLeave,
  useCurrentMatches,
  useIsRouting,
  useLocation,
  useMatch,
  useNavigate,
  useParams,
  useSearchParams,
  useSubmission,
  useSubmissions,
} from "../src/router";
import { $RAW, createStore, DEV as storeDEV } from "../src/store";

describe("@tschk/moonshine-solid/router (@solidjs/router replacement)", () => {
  test("renders routes, nested layouts, dynamic params, A links, searchParams, and Navigate in SSR and DOM", async () => {
    const ssrHtml = renderToString(() =>
      hSSR(Router, {
        url: "/users/42?role=admin#bio",
        children: [
          hSSR(Route, {
            path: "/users/:id",
            component: () => {
              const params = useParams<{ id: string }>();
              const location = useLocation();
              const [search] = useSearchParams<{ role: string }>();
              const match = useMatch(() => "/users/:id");
              const matches = useCurrentMatches();
              const routing = useIsRouting();
              return hSSR("article", null, [
                hSSR(
                  "h1",
                  null,
                  () =>
                    `User ${params.id} (${search.role}) hash=${location.hash} matched=${Boolean(match())} depth=${matches().length} routing=${routing()}`,
                ),
                hSSR(A, {
                  href: "/users/42",
                  activeClass: "is-active",
                  children: "Profile",
                }),
                hSSR(A, {
                  href: "/settings",
                  inactiveClass: "is-idle",
                  children: "Settings",
                }),
              ]);
            },
          }),
        ],
      }),
    );

    expect(ssrHtml).toContain(
      "<h1>User 42 (admin) hash=#bio matched=true depth=1 routing=false</h1>",
    );
    expect(ssrHtml).toContain(
      '<a href="/users/42" class="is-active" aria-current="page">Profile</a>',
    );
    expect(ssrHtml).toContain(
      '<a href="/settings" class="is-idle">Settings</a>',
    );

    let navFn!: ReturnType<typeof useNavigate>;
    let setSearchFn!: ReturnType<typeof useSearchParams>[1];
    const leaveEvents: string[] = [];
    let disposeRoot!: () => void;

    const rootEl = createRoot((dispose) => {
      disposeRoot = dispose;
      return hDOM(
        "div",
        null,
        hDOM(MemoryRouter, {
          url: "/items/1?sort=asc",
          children: [
            hDOM(Route, {
              path: "/items/:id",
              component: () => {
                const params = useParams<{ id: string }>();
                const [search, setSearch] = useSearchParams<{ sort: string }>();
                navFn = useNavigate();
                setSearchFn = setSearch;
                useBeforeLeave((e) => {
                  leaveEvents.push(`${e.from.pathname}->${String(e.to)}`);
                });
                return hDOM(
                  "p",
                  null,
                  () => `Item=${params.id};Sort=${search.sort ?? "none"}`,
                );
              },
            }),
            hDOM(Route, {
              path: "/legacy",
              component: () => hDOM(Navigate, { href: "/items/99?sort=desc" }),
            }),
          ],
        }),
      );
    }) as HTMLElement;

    expect(rootEl.textContent).toBe("Item=1;Sort=asc");
    setSearchFn({ sort: "updated" });
    expect(rootEl.textContent).toBe("Item=1;Sort=updated");

    navFn("/legacy");
    expect(rootEl.textContent).toBe("Item=99;Sort=desc");
    expect(leaveEvents).toEqual([
      "/items/1->/items/1?sort=updated",
      "/items/1->/legacy",
    ]);
    disposeRoot();

    const hashHtml = renderToString(() =>
      hSSR(HashRouter, {
        url: "/dashboard",
        children: hSSR(Route, {
          path: "/dashboard",
          component: () => hSSR("span", null, "Hash Dashboard"),
        }),
      }),
    );
    expect(hashHtml).toBe("<span>Hash Dashboard</span>");

    const staticHtml = renderToString(() =>
      hSSR(StaticRouter, {
        url: "/docs/intro",
        children: hSSR(Routes, {
          children: hSSR(Route, {
            path: "/docs/:slug",
            component: () => {
              const params = useParams<{ slug: string }>();
              return hSSR("em", null, () => `Doc:${params.slug}`);
            },
          }),
        }),
      }),
    );
    expect(staticHtml).toBe("<em>Doc:intro</em>");
  });

  test("store $RAW symbol returns underlying raw object without reactive tracking", () => {
    expect(storeDEV).toEqual({ $RAW });
    const rawSource = { count: 5, nested: { label: "ok" } };
    const [state] = createStore(rawSource);
    expect((state as any)[$RAW]).toBe(rawSource);
    expect((state.nested as any)[$RAW]).toBe(rawSource.nested);
    expect($RAW in state).toBe(true);
  });

  test("supports query, createAsync, createAsyncStore, revalidate, action, useSubmission, and response helpers", async () => {
    let counter = 10;
    const getCount = query((mult: number) => {
      counter++;
      return counter * mult;
    }, "count-query");

    expect(getCount.key).toBe("count-query");
    expect(getCount.keyFor(2)).toBe("count-query:[2]");

    createRoot((dispose) => {
      const value = createAsync(() => getCount(2));
      const storeValue = createAsyncStore(() => ({ total: getCount(2) }));
      expect(value()).toBe(22);
      expect(value.latest).toBe(22);
      expect(storeValue().total).toBe(22);

      revalidate("count-query");
      expect(value()).toBe(24);
      dispose();
    });

    const incrementAction = action(async (delta: number) => {
      if (delta < 0) throw new Error("negative delta");
      return delta + 100;
    }, "increment-action");

    await createRoot(async (dispose) => {
      const run = useAction(incrementAction);
      const submission = useSubmission(incrementAction);
      const submissions = useSubmissions(incrementAction);

      expect(submission.pending).toBe(false);
      const result = await run(5);
      expect(result).toBe(105);
      expect(submission.result).toBe(105);
      expect(submissions().length).toBe(1);

      await expect(run(-1)).rejects.toThrow("negative delta");
      expect(submission.error).toBeInstanceOf(Error);
      submission.clear();
      expect(submission.result).toBeUndefined();
      dispose();
    });

    const redir = redirect("/login", 303);
    expect(redir.status).toBe(303);
    expect(redir.headers.get("Location")).toBe("/login");

    const rel = reload({ revalidate: "count-query" });
    expect(rel.headers.get("X-Single-Flight")).toBe("count-query");

    const jsonRes = json({ ok: true }, { status: 201 });
    expect(jsonRes.status).toBe(201);
    expect(await jsonRes.json()).toEqual({ ok: true });
  });
});

describe("@tschk/moonshine-solid/meta (@solidjs/meta replacement)", () => {
  test("collects and deduplicates Title, Meta, Link, Style, and Base tags in SSR and DOM", () => {
    const tags: Array<{ tag: string; props: Record<string, unknown> }> = [];
    const bodyHtml = renderToString(() =>
      hSSR(MetaProvider, {
        tags,
        children: [
          hSSR(Title, { children: "Default Title" }),
          hSSR(Meta, { name: "description", content: "First description" }),
          hSSR(Base, { href: "https://example.com/" }),
          hSSR(Link, { rel: "canonical", href: "https://example.com/page" }),
          hSSR(Style, { children: "body { margin: 0; }" }),
          hSSR("main", null, [
            hSSR(Title, { children: "Overridden <Title>" }),
            hSSR(Meta, {
              name: "description",
              content: "Overridden description & more",
            }),
            hSSR("p", null, "Page Content"),
          ]),
        ],
      }),
    );

    expect(bodyHtml).toBe("<main><p>Page Content</p></main>");
    const headHtml = renderTags(tags);
    expect(headHtml).toContain("<title>Overridden &lt;Title&gt;</title>");
    expect(headHtml).not.toContain("Default Title");
    expect(headHtml).toContain(
      '<meta name="description" content="Overridden description &amp; more">',
    );
    expect(headHtml).not.toContain("First description");
    expect(headHtml).toContain('<base href="https://example.com/">');
    expect(headHtml).toContain(
      '<link rel="canonical" href="https://example.com/page">',
    );
    expect(headHtml).toContain("<style>body { margin: 0; }</style>");

    let disposeRoot!: () => void;
    createRoot((dispose) => {
      disposeRoot = dispose;
      return hDOM(MetaProvider, {
        children: [
          hDOM(Title, { children: "DOM Page Title" }),
          hDOM(Meta, { name: "theme-color", content: "#112233" }),
        ],
      });
    });

    expect(document.title).toBe("DOM Page Title");
    expect(
      document.head
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute("content"),
    ).toBe("#112233");
    disposeRoot();
  });
});

const sourceCompiler = process.env.MOONSHINE_CREPUS_COMPILER;

test.skipIf(!sourceCompiler)(
  "Crepus lowers explicit Solid source modules importing solid-js/store, solid-js/web, @solidjs/router, and @solidjs/meta",
  async () => {
    const root = join(import.meta.dir, "..");
    const dir = await mkdtemp(join(tmpdir(), "moonshine-solid-ecosystem-"));
    try {
      for (const [name, source] of [
        ["moonshine", join(root, "../core")],
        ["moonshine-dom", join(root, "../dom")],
        ["moonshine-solid", root],
      ]) {
        const target = join(dir, "node_modules/@tschk", name!);
        await cp(join(source!, "src"), join(target, "src"), {
          recursive: true,
        });
        await cp(join(source!, "package.json"), join(target, "package.json"));
      }

      const appSource = `/** @jsxImportSource solid-js */
import { createSignal } from "solid-js";
import { createStore, produce, $RAW } from "solid-js/store";
import { Show, NoHydration, isServer } from "solid-js/web";
import { Router, Route, A, useParams } from "@solidjs/router";
import { MetaProvider, Title, Meta, renderTags } from "@solidjs/meta";

function UserView() {
  const params = useParams<{ id: string }>();
  return (
    <div class="route-box">
      <span class="user-id">id:{params.id}</span>
      <A href="/u/77" activeClass="current">Link</A>
    </div>
  );
}

export const headTags: Array<{ tag: string; props: Record<string, unknown> }> = [];

export default function App() {
  const [state, setState] = createStore({ count: 3, label: "solid-store" });
  setState(produce((draft) => { draft.count += 2; }));
  const [visible] = createSignal(true);
  const hasRaw = Boolean((state as any)[$RAW]);
  return (
    <MetaProvider tags={headTags}>
      <Title>Solid Ecosystem</Title>
      <Meta name="generator" content="moonshine" />
      <div data-server={String(isServer)} data-raw={String(hasRaw)}>
        <Show when={visible()}>
          <strong>{state.label}:{state.count}</strong>
        </Show>
        <NoHydration>
          <i>static</i>
        </NoHydration>
        <Router url="/u/77">
          <Route path="/u/:id" component={UserView} />
        </Router>
      </div>
    </MetaProvider>
  );
}
export { renderTags };
`;
      await Bun.write(join(dir, "source/App.tsx"), appSource);

      for (const [emitTarget, outName] of [
        ["moonshine-dom", "dom"],
        ["moonshine-ssr", "ssr"],
      ] as const) {
        const proc = Bun.spawn(
          [
            sourceCompiler!,
            "web",
            "build",
            "--site",
            join(dir, "source"),
            "--entry",
            "App.tsx",
            "--emit",
            emitTarget,
            "--out-dir",
            join(dir, outName),
          ],
          { stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, stderr, code] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        expect(code, stdout + stderr).toBe(0);
      }

      const checkScript = `
import assert from "node:assert/strict";
import AppSSR, { headTags, renderTags } from "./ssr/CrepusEmit.moonshine-ssr.ts";
import { h, renderToString } from "@tschk/moonshine-solid/ssr";
headTags.length = 0;
const html = renderToString(() => h(AppSSR, {}));
assert.ok(html.includes('data-server="true"'), html);
assert.ok(html.includes('data-raw="true"'), html);
assert.ok(html.includes('<strong>solid-store:5</strong>'), html);
assert.ok(html.includes('<i>static</i>'), html);
assert.ok(html.includes('<span class="user-id">id:77</span>'), html);
assert.ok(html.includes('<a href="/u/77" class="current" aria-current="page">Link</a>'), html);
const head = renderTags(headTags);
assert.ok(head.includes('<title>Solid Ecosystem</title>'), head);
assert.ok(head.includes('<meta name="generator" content="moonshine">'), head);
`;
      await Bun.write(join(dir, "check.ts"), checkScript);
      const runCheck = Bun.spawn(
        [Bun.which("bun")!, "--no-install", "check.ts"],
        {
          cwd: dir,
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [out, err, exitCode] = await Promise.all([
        new Response(runCheck.stdout).text(),
        new Response(runCheck.stderr).text(),
        runCheck.exited,
      ]);
      expect(exitCode, out + err).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
