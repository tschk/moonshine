import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AstroContainer,
  AstroCookies,
  clearCollections,
  defineCollection,
  experimental_AstroContainer,
  file,
  getCollection,
  getEntry,
  glob,
  matchGlobPattern,
  parseFrontmatter,
  parseSimpleCsv,
  parseSimpleToml,
  parseSimpleYaml,
  registerCollections,
  render,
  useAstro,
  z,
} from "../src";
import {
  h,
  sourceComponent,
  sourceElement,
  sourceHasSlot,
  sourceSlot,
} from "../src/ssr";

afterEach(() => {
  clearCollections();
});

describe("@tschk/moonshine-astro/loaders", () => {
  test("parseFrontmatter, parseSimpleYaml, parseSimpleToml, parseSimpleCsv, and matchGlobPattern work without host dependencies", () => {
    const md = [
      "---",
      'title: "Hello Astro"',
      "order: 2",
      "published: true",
      "tags: [astro, moonshine]",
      "author:",
      "  name: Ada",
      "  role: Engineer",
      "---",
      "# Welcome",
      "",
      "Body paragraph.",
    ].join("\n");

    const parsed = parseFrontmatter(md);
    expect(parsed.data).toEqual({
      title: "Hello Astro",
      order: 2,
      published: true,
      tags: ["astro", "moonshine"],
      author: {
        name: "Ada",
        role: "Engineer",
      },
    });
    expect(parsed.body).toBe("# Welcome\n\nBody paragraph.");

    const tomlMd = [
      "+++",
      'title = "TOML Post"',
      "draft = false",
      "+++",
      "TOML body.",
    ].join("\n");
    const parsedTomlMd = parseFrontmatter(tomlMd);
    expect(parsedTomlMd.data).toEqual({ title: "TOML Post", draft: false });
    expect(parsedTomlMd.body).toBe("TOML body.");

    const yamlList = parseSimpleYaml(
      ["- id: first", "  label: One", "- id: second", "  label: Two"].join(
        "\n",
      ),
    );
    expect(yamlList).toEqual([
      { id: "first", label: "One" },
      { id: "second", label: "Two" },
    ]);

    const tomlObj = parseSimpleToml(
      [
        'site = "Moonshine"',
        "[[authors]]",
        'id = "ada"',
        'name = "Ada Lovelace"',
        "[[authors]]",
        'id = "grace"',
        'name = "Grace Hopper"',
      ].join("\n"),
    );
    expect(tomlObj).toEqual({
      site: "Moonshine",
      authors: [
        { id: "ada", name: "Ada Lovelace" },
        { id: "grace", name: "Grace Hopper" },
      ],
    });

    const csvRows = parseSimpleCsv(
      [
        "id,name,bio",
        'ada,"Ada Lovelace","First, programmer"',
        "grace,Grace Hopper,COBOL",
      ].join("\n"),
    );
    expect(csvRows).toEqual([
      { id: "ada", name: "Ada Lovelace", bio: "First, programmer" },
      { id: "grace", name: "Grace Hopper", bio: "COBOL" },
    ]);

    expect(matchGlobPattern("guides/intro.md", "**/*.md")).toBe(true);
    expect(
      matchGlobPattern("drafts/secret.md", ["**/*.md", "!drafts/**"]),
    ).toBe(false);
    expect(matchGlobPattern("posts/news.mdx", "**/*.{md,mdx}")).toBe(true);
  });

  test("glob() loader discovers, parses, validates, and renders Markdown and data files from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "moonshine-astro-glob-"));
    try {
      await mkdir(join(dir, "guides"), { recursive: true });
      await mkdir(join(dir, "drafts"), { recursive: true });

      await writeFile(
        join(dir, "intro.md"),
        [
          "---",
          "title: Getting Started",
          "order: 1",
          "---",
          "# Getting Started",
          "",
          "Install Moonshine.",
        ].join("\n"),
      );
      await writeFile(
        join(dir, "guides/advanced.md"),
        [
          "---",
          "title: Advanced Signals",
          "order: 2",
          "---",
          "## Deep Dive",
          "",
          "Fine-grained updates.",
        ].join("\n"),
      );
      await writeFile(
        join(dir, "drafts/ignored.md"),
        ["---", "title: Draft", "order: 99", "---", "Draft text."].join("\n"),
      );

      registerCollections({
        docs: defineCollection({
          loader: glob({
            pattern: ["**/*.md", "!drafts/**"],
            base: dir,
          }),
          schema: z.object({
            title: z.string(),
            order: z.number(),
          }),
        }),
      });

      const entries = await getCollection("docs");
      expect(entries.map((e) => e.id)).toEqual(["guides/advanced", "intro"]);

      const intro = await getEntry("docs", "intro");
      expect(intro?.data).toEqual({ title: "Getting Started", order: 1 });
      expect(intro?.body).toContain("# Getting Started");

      const rendered = await render(intro!);
      expect(rendered.headings).toEqual([
        { depth: 1, slug: "getting-started", text: "Getting Started" },
      ]);
      expect(rendered.Content()).toContain(
        '<h1 id="getting-started">Getting Started</h1>',
      );
      expect(rendered.remarkPluginFrontmatter.title).toBe("Getting Started");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("file() loader loads JSON, YAML, TOML, and CSV collections and validates with schema", async () => {
    const dir = await mkdtemp(join(tmpdir(), "moonshine-astro-file-"));
    try {
      const jsonPath = join(dir, "authors.json");
      await writeFile(
        jsonPath,
        JSON.stringify([
          { id: "ada", name: "Ada", active: true },
          { id: "grace", name: "Grace", active: false },
        ]),
      );

      const yamlPath = join(dir, "releases.yaml");
      await writeFile(
        yamlPath,
        [
          "v1:",
          "  version: 1.0.0",
          "  channel: stable",
          "v2:",
          "  version: 2.0.0-beta",
          "  channel: beta",
        ].join("\n"),
      );

      const csvPath = join(dir, "countries.csv");
      await writeFile(
        csvPath,
        "id,name,code\nau,Australia,61\nnz,New Zealand,64\n",
      );

      registerCollections({
        authors: defineCollection({
          loader: file(jsonPath),
          schema: z.object({
            id: z.string(),
            name: z.string(),
            active: z.boolean(),
          }),
        }),
        releases: defineCollection({
          loader: file(yamlPath),
          schema: z.object({
            version: z.string(),
            channel: z.enum(["stable", "beta"]),
          }),
        }),
        countries: defineCollection({
          loader: file(csvPath),
          schema: z.object({
            id: z.string(),
            name: z.string(),
            code: z.coerce.number(),
          }),
        }),
      });

      const authors = await getCollection("authors", (a) => a.data.active);
      expect(authors.length).toBe(1);
      expect(authors[0]!.id).toBe("ada");
      expect(authors[0]!.data.name).toBe("Ada");

      const v2 = await getEntry("releases", "v2");
      expect(v2?.data).toEqual({ version: "2.0.0-beta", channel: "beta" });

      const nz = await getEntry("countries", "nz");
      expect(nz?.data).toEqual({ id: "nz", name: "New Zealand", code: 64 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("@tschk/moonshine-astro/container", () => {
  test("AstroContainer.create renders native SSR components, props, slots, and Astro context", async () => {
    expect(experimental_AstroContainer).toBe(AstroContainer);
    const container = await AstroContainer.create({
      site: "https://moonshine.dev",
      locals: { tenant: "acme" },
    });

    const Card = (props: { title: string }, slots: Record<string, any>) => {
      const astro = useAstro();
      return sourceElement(
        "article",
        [
          ["data-tenant", String(astro.locals.tenant)],
          ["data-has-footer", String(sourceHasSlot(slots, "footer"))],
        ],
        h("h2", null, props.title),
        h("div", { class: "body" }, sourceSlot(slots, "default", "Empty")),
        sourceSlot(slots, "footer"),
      );
    };

    const html = await container.renderToString(
      (props, slots) => sourceComponent(Card, props, slots),
      {
        props: { title: "Hello Container" },
        slots: {
          default: "<p>Slot content</p>",
          footer: () => "<footer>Footer</footer>",
        },
      },
    );

    expect(html).toBe(
      '<article data-tenant="acme" data-has-footer="true"><h2>Hello Container</h2><div class="body"><p>Slot content</p></div><footer>Footer</footer></article>',
    );

    const fullDoc = await container.renderToString(
      () => h("html", null, h("body", null, "Page")),
      { partial: false },
    );
    expect(fullDoc).toBe("<!DOCTYPE html><html><body>Page</body></html>");
  });

  test("AstroContainer.renderToResponse handles cookies, headers, redirects, endpoints, and insertPageRoute rewrites", async () => {
    const container = await AstroContainer.create();

    const TargetPage = (props: { label?: string }) => {
      const astro = useAstro();
      return h(
        "main",
        { "data-slug": astro.params.slug },
        props.label ?? "Rewritten Target",
      );
    };

    container.insertPageRoute("/posts/[slug]", TargetPage);

    const RewritingPage = async () => {
      const astro = useAstro();
      astro.cookies.set("session", "abc", { path: "/", httpOnly: true });
      if (astro.url.searchParams.get("mode") === "redirect") {
        return astro.redirect("/login", 307);
      }
      if (astro.url.searchParams.get("mode") === "rewrite") {
        return await astro.rewrite("/posts/welcome");
      }
      astro.response.status = 201;
      astro.response.headers.set("x-custom", "ok");
      return h(
        "p",
        null,
        `Hello ${astro.cookies.get("user")?.value ?? "guest"}`,
      );
    };

    const normalRes = await container.renderToResponse(RewritingPage, {
      request: new Request("https://example.com/dashboard", {
        headers: { cookie: "user=ada" },
      }),
    });
    expect(normalRes.status).toBe(201);
    expect(normalRes.headers.get("x-custom")).toBe("ok");
    expect(normalRes.headers.get("set-cookie")).toContain("session=abc");
    expect(await normalRes.text()).toBe("<p>Hello ada</p>");

    const redirectRes = await container.renderToResponse(RewritingPage, {
      url: "https://example.com/dashboard?mode=redirect",
    });
    expect(redirectRes.status).toBe(307);
    expect(redirectRes.headers.get("location")).toBe("/login");
    expect(redirectRes.headers.get("set-cookie")).toContain("session=abc");

    const rewriteRes = await container.renderToResponse(RewritingPage, {
      url: "https://example.com/dashboard?mode=rewrite",
      props: { label: "Loaded via Rewrite" },
    });
    expect(rewriteRes.status).toBe(200);
    expect(await rewriteRes.text()).toBe(
      '<main data-slug="welcome">Loaded via Rewrite</main>',
    );

    const endpointMod = {
      GET({
        params,
        url,
      }: {
        params: Record<string, string | undefined>;
        url: URL;
      }) {
        return Response.json({ id: params.id, path: url.pathname });
      },
    };
    const apiRes = await container.renderToResponse(endpointMod, {
      routeType: "endpoint",
      url: "https://example.com/api/items/42",
      params: { id: "42" },
    });
    expect(apiRes.status).toBe(200);
    expect(await apiRes.json()).toEqual({
      id: "42",
      path: "/api/items/42",
    });

    const cookies = new AstroCookies("theme=dark");
    const slotProbe = async () => {
      const astro = useAstro();
      const header = astro.slots.has("header")
        ? await astro.slots.render("header", ["Ada"])
        : "";
      return `<section data-theme="${astro.cookies.get("theme")?.value}">${header}</section>`;
    };
    const slotHtml = await container.renderToString(slotProbe, {
      cookies,
      slots: {
        header: (name: string) => `<h1>Welcome ${name}</h1>`,
      },
    });
    expect(slotHtml).toBe(
      '<section data-theme="dark"><h1>Welcome Ada</h1></section>',
    );
  });
});
