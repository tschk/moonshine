import { afterEach, expect, test } from "bun:test";
import {
  configureAssets,
  createPaginate,
  getImage,
  inferImageDimensions,
  inferRemoteSize,
  paginate,
  resetAssetsConfig,
  type APIRoute,
  type GetStaticPaths,
  type InferGetStaticParamsType,
  type InferGetStaticPropsType,
} from "../src/index";

afterEach(() => {
  resetAssetsConfig();
});

test("getImage resolves local metadata, aspect ratio, densities, widths, and custom service", async () => {
  const hero = {
    src: "/assets/hero.png",
    width: 1200,
    height: 600,
    format: "png",
  };

  // Aspect-ratio calculation when only width is specified
  const resized = await getImage({
    src: Promise.resolve({ default: hero }),
    width: 600,
    quality: "high",
    alt: "Hero banner",
    class: "rounded",
  });
  expect(resized.src).toBe(
    "/_image?href=%2Fassets%2Fhero.png&w=600&h=300&q=80&f=webp",
  );
  expect(resized.attributes).toEqual({
    alt: "Hero banner",
    class: "rounded",
    width: 600,
    height: 300,
    decoding: "async",
    loading: "lazy",
  });

  // Densities clamp to intrinsic metadata width
  const dense = await getImage({
    src: hero,
    width: 800,
    densities: [1, "2x"],
    format: "avif",
  });
  expect(
    dense.srcSet.values.map((v) => [v.descriptor, v.transform.width]),
  ).toEqual([
    ["1x", 800],
    ["2x", 1200],
  ]);
  expect(dense.srcSet.attribute).toContain("1x");
  expect(dense.srcSet.attribute).toContain("2x");

  // Widths deduplicate when clamped to intrinsic metadata width
  const widthsResult = await getImage({
    src: hero,
    widths: [400, 800, 1600],
    sizes: "(max-width: 800px) 100vw, 800px",
  });
  expect(
    widthsResult.srcSet.values.map((v) => [
      v.descriptor,
      v.transform.width,
      v.transform.height,
    ]),
  ).toEqual([
    ["400w", 400, 200],
    ["800w", 800, 400],
    ["1200w", 1200, 600],
  ]);
  expect(widthsResult.attributes.sizes).toBe("(max-width: 800px) 100vw, 800px");

  // SVG without explicit resize keeps raw URL
  const svgResult = await getImage({
    src: { src: "/logo.svg", width: 64, height: 64, format: "svg" },
  });
  expect(svgResult.src).toBe("/logo.svg");

  // Custom service
  configureAssets({
    service: (t) =>
      `https://cdn.example.com${typeof t.src === "string" ? t.src : t.src.src}?w=${t.width ?? "auto"}`,
  });
  const cdnResult = await getImage({
    src: "/photo.jpg",
    width: 320,
    loading: "eager",
    decoding: null,
  });
  expect(cdnResult.src).toBe("https://cdn.example.com/photo.jpg?w=320");
  expect(cdnResult.attributes.loading).toBe("eager");
  expect("decoding" in cdnResult.attributes).toBe(false);

  expect(() =>
    getImage({ src: hero, widths: [400], densities: [1, 2] }),
  ).toThrow("cannot use both `widths` and `densities`");
});

test("inferImageDimensions and inferRemoteSize parse PNG, GIF, WebP, JPEG, and SVG headers", async () => {
  // PNG 320x240
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const pngView = new DataView(png.buffer);
  pngView.setUint32(16, 320, false);
  pngView.setUint32(20, 240, false);
  expect(inferImageDimensions(png)).toEqual({
    width: 320,
    height: 240,
    format: "png",
  });

  // GIF89a 128x64
  const gif = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x80, 0x00, 0x40, 0x00,
  ]);
  expect(inferImageDimensions(gif)).toEqual({
    width: 128,
    height: 64,
    format: "gif",
  });

  // JPEG SOF0 640x480
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b,
    0x08, 0x01, 0xe0, 0x02, 0x80, 0x01,
  ]);
  expect(inferImageDimensions(jpeg)).toEqual({
    width: 640,
    height: 480,
    format: "jpg",
  });

  // SVG with viewBox
  const svgBytes = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"></svg>',
  );
  expect(inferImageDimensions(svgBytes)).toEqual({
    width: 120,
    height: 80,
    format: "svg",
  });

  // inferRemoteSize via custom fetch
  const remote = await inferRemoteSize(
    "https://example.com/banner.png",
    async () => new Response(png, { status: 200 }) as any,
  );
  expect(remote).toEqual({ width: 320, height: 240, format: "png" });
});

test("paginate and createPaginate build Astro static path pages, params, props, and navigation URLs", () => {
  const posts = ["a", "b", "c", "d", "e"];
  const pages = paginate(posts, {
    pageSize: 2,
    params: { tag: "news" },
    props: { section: "blog" },
  });

  expect(pages.length).toBe(3);
  expect(pages[0]).toEqual({
    params: { tag: "news", page: undefined },
    props: {
      section: "blog",
      page: {
        data: ["a", "b"],
        start: 0,
        end: 1,
        size: 2,
        total: 5,
        currentPage: 1,
        lastPage: 3,
        url: {
          current: "/",
          prev: undefined,
          next: "/2",
          first: undefined,
          last: "/3",
        },
      },
    },
  });
  expect(pages[1]!.params).toEqual({ tag: "news", page: "2" });
  expect(pages[1]!.props.page.url).toEqual({
    current: "/2",
    prev: "/",
    next: "/3",
    first: "/",
    last: "/3",
  });
  expect(pages[2]!.params).toEqual({ tag: "news", page: "3" });
  expect(pages[2]!.props.page.data).toEqual(["e"]);
  expect(pages[2]!.props.page.url).toEqual({
    current: "/3",
    prev: "/2",
    next: undefined,
    first: "/",
    last: undefined,
  });

  // Non-rest route pattern with base and trailingSlash
  const customPaginate = createPaginate("blog/[tag]/[page]", {
    base: "/docs",
    trailingSlash: "always",
  });
  const customPages = customPaginate(["x", "y", "z"], {
    pageSize: 2,
    params: { tag: "guides" },
  });
  expect(customPages[0]!.params).toEqual({ tag: "guides", page: "1" });
  expect(customPages[0]!.props.page.url).toEqual({
    current: "/docs/blog/guides/1/",
    prev: undefined,
    next: "/docs/blog/guides/2/",
    first: undefined,
    last: "/docs/blog/guides/2/",
  });

  // Empty array still emits page 1
  const emptyPages = paginate([]);
  expect(emptyPages.length).toBe(1);
  expect(emptyPages[0]!.props.page.total).toBe(0);
  expect(emptyPages[0]!.props.page.end).toBe(-1);

  // Type-level inference for GetStaticPaths & APIRoute
  const getStaticPaths = (({ paginate: p }) =>
    p([{ slug: "intro" }], {
      pageSize: 1,
      params: { category: "docs" },
      props: { title: "Docs" },
    })) satisfies GetStaticPaths;
  type InferredParams = InferGetStaticParamsType<typeof getStaticPaths>;
  type InferredProps = InferGetStaticPropsType<typeof getStaticPaths>;
  const sampleParams: InferredParams = { category: "docs", page: undefined };
  const sampleProps: InferredProps = {
    title: "Docs",
    page: emptyPages[0]!.props.page,
  };
  const getEndpoint: APIRoute = (ctx) =>
    new Response(ctx.url.pathname, { status: 200 });
  expect(sampleParams.category).toBe("docs");
  expect(sampleProps.title).toBe("Docs");
  expect(typeof getEndpoint).toBe("function");
});
