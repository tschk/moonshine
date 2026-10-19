import { describe, expect, test } from "bun:test";
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
