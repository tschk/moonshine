import { beforeEach, describe, expect, test } from "bun:test";
import { defineAction, isInputError } from "../src/actions";
import {
  ZodError,
  clearCollections,
  defineCollection,
  extractMarkdownHeadings,
  getCollection,
  getEntries,
  getEntry,
  getLiveCollection,
  getLiveEntry,
  reference,
  registerCollections,
  render,
  seedCollection,
  z,
} from "../src/content";

describe("@tschk/moonshine-astro content collections & z schema builder", () => {
  beforeEach(() => {
    clearCollections();
  });

  test("z schema builder supports primitives, objects, arrays, enums, unions, transforms, refinements, and coercion", () => {
    const postSchema = z
      .object({
        title: z.string().trim().min(3),
        views: z.coerce.number().int().nonnegative().default(0),
        published: z.boolean().default(false),
        publishedAt: z.coerce.date().optional(),
        category: z.enum(["news", "engineering", "release"]),
        tags: z.array(z.string().toLowerCase()).nonempty(),
        rating: z.union([z.number(), z.literal("unrated")]).nullable(),
        meta: z.record(z.string(), z.unknown()).optional(),
      })
      .refine((val) => !val.published || val.publishedAt !== undefined, {
        message: "Published posts require publishedAt",
        path: ["publishedAt"],
      });

    const valid = postSchema.parse({
      title: "  Moonshine 0.4.57  ",
      views: "42",
      published: true,
      publishedAt: "2026-10-20T00:00:00.000Z",
      category: "release",
      tags: ["Astro", "Nuxt"],
      rating: "unrated",
      meta: { featured: true },
    });

    expect(valid.title).toBe("Moonshine 0.4.57");
    expect(valid.views).toBe(42);
    expect(valid.published).toBe(true);
    expect(valid.publishedAt).toBeInstanceOf(Date);
    expect(valid.category).toBe("release");
    expect(valid.tags).toEqual(["astro", "nuxt"]);
    expect(valid.rating).toBe("unrated");
    expect(valid.meta).toEqual({ featured: true });

    const invalid = postSchema.safeParse({
      title: "Hi",
      views: -5,
      published: true,
      category: "unknown",
      tags: [],
      rating: null,
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error).toBeInstanceOf(ZodError);
      const paths = invalid.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("title");
      expect(paths).toContain("views");
      expect(paths).toContain("category");
      expect(paths).toContain("tags");
    }
  });

  test("z integrates with defineAction for Astro Actions input validation", async () => {
    const subscribe = defineAction({
      input: z.object({
        email: z.string().email(),
        plan: z.enum(["free", "pro"]).default("free"),
      }),
      handler: async (input) => ({
        subscribed: input.email,
        plan: input.plan,
      }),
    });

    const bad = await subscribe({ email: "not-an-email" });
    expect(bad.error).toBeDefined();
    expect(isInputError(bad.error)).toBe(true);
    if (isInputError(bad.error)) {
      expect(bad.error.fields.email).toEqual(["Invalid email"]);
    }

    const ok = await subscribe({ email: "ada@example.com" });
    expect(ok).toEqual({
      data: { subscribed: "ada@example.com", plan: "free" },
      error: undefined,
    });
  });

  test("defineCollection, seedCollection, getCollection, getEntry, getEntries, reference, and render", async () => {
    const authors = defineCollection({
      type: "data",
      schema: z.object({
        name: z.string(),
        role: z.string().default("Contributor"),
      }),
    });

    const blog = defineCollection({
      type: "content",
      schema: ({ image }) =>
        z.object({
          title: z.string(),
          draft: z.boolean().default(false),
          cover: image().optional(),
          author: reference("authors"),
          related: z.array(reference("blog")).default([]),
        }),
    });

    registerCollections({ authors, blog });

    seedCollection("authors", {
      ada: { data: { name: "Ada Lovelace", role: "Founder" } },
      grace: { data: { name: "Grace Hopper" } },
    });

    seedCollection("blog", [
      {
        id: "hello-world.md",
        data: {
          title: "Hello World",
          draft: false,
          cover: { src: "/img/hello.png", width: 800, height: 400 },
          author: "ada",
          related: [{ collection: "blog", id: "second-post" }],
        },
        body: "# Welcome\n\nFirst paragraph.\n\n## Getting Started\n\nSecond paragraph.",
      },
      {
        id: "second-post.md",
        data: {
          title: "Second Post",
          draft: true,
          author: { collection: "authors", id: "grace" },
        },
        body: "# Second Post\n\nDraft content.",
      },
    ]);

    const publishedPosts = await getCollection(
      "blog",
      (entry) => !entry.data.draft,
    );
    expect(publishedPosts).toHaveLength(1);
    expect(publishedPosts[0]?.id).toBe("hello-world.md");
    expect(publishedPosts[0]?.slug).toBe("hello-world");
    expect(publishedPosts[0]?.data.author).toEqual({
      collection: "authors",
      id: "ada",
    });

    const authorEntry = await getEntry(publishedPosts[0]!.data.author);
    expect(authorEntry?.data).toEqual({
      name: "Ada Lovelace",
      role: "Founder",
    });

    const relatedEntries = await getEntries(publishedPosts[0]!.data.related);
    expect(relatedEntries).toHaveLength(1);
    expect(relatedEntries[0]?.slug).toBe("second-post");

    const rendered = await render(publishedPosts[0]!);
    expect(rendered.headings).toEqual([
      { depth: 1, slug: "welcome", text: "Welcome" },
      { depth: 2, slug: "getting-started", text: "Getting Started" },
    ]);
    expect(rendered.Content()).toContain('<h1 id="welcome">Welcome</h1>');
    expect(rendered.Content()).toContain(
      '<h2 id="getting-started">Getting Started</h2>',
    );
    expect(rendered.remarkPluginFrontmatter.title).toBe("Hello World");
  });

  test("Content Layer loaders, getLiveCollection, getLiveEntry, and extractMarkdownHeadings", async () => {
    let fetchCount = 0;
    const releases = defineCollection({
      loader: {
        name: "release-loader",
        load: async ({ store, parseData, generateDigest }) => {
          fetchCount++;
          const raw = {
            version: `0.4.${56 + fetchCount}`,
            notes: "Native Astro Content Collections",
          };
          const data = await parseData({ id: "latest", data: raw });
          store.set({
            id: "latest",
            data,
            digest: generateDigest(data),
          });
        },
      },
      schema: z.object({
        version: z.string(),
        notes: z.string(),
      }),
    });

    registerCollections({ releases });

    const all = await getCollection("releases");
    expect(all).toHaveLength(1);
    expect(all[0]?.data.version).toBe("0.4.57");
    expect(fetchCount).toBe(1);

    // Cached on standard getCollection
    await getCollection("releases");
    expect(fetchCount).toBe(1);

    // Live collection re-runs loader
    const live = await getLiveCollection("releases");
    expect(live.error).toBeUndefined();
    expect(live.entries?.[0]?.data.version).toBe("0.4.58");
    expect(fetchCount).toBe(2);

    const liveSingle = await getLiveEntry("releases", "latest");
    expect(liveSingle.entry?.data.version).toBe("0.4.59");

    // Ignore headings inside fenced code blocks
    const md = [
      "# Real Heading",
      "```md",
      "# Fake Heading Inside Code",
      "```",
      "### Sub Heading!",
    ].join("\n");
    expect(extractMarkdownHeadings(md)).toEqual([
      { depth: 1, slug: "real-heading", text: "Real Heading" },
      { depth: 3, slug: "sub-heading", text: "Sub Heading!" },
    ]);
  });
});
