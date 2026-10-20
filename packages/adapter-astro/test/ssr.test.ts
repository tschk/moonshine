import { expect, test } from "bun:test";
import {
  classList,
  h,
  renderToString,
  sourceServerIsland,
  sourceSlot,
  withAstroContext,
  type SourceSlots,
} from "../src/ssr";
import {
  clearPrefetchedUrls,
  getPrefetchedUrls,
  init,
  prefetch,
} from "../src/transitions";

test("Astro source children preserve truthy booleans and omit falsey values except zero", () => {
  expect(
    renderToString(() => h("p", null, true, false, 0, NaN, 0n, ["<&", true])),
  ).toBe("<p>true0&lt;&amp;true</p>");
  expect(() =>
    renderToString(() => h("p", null, () => Promise.resolve("later") as never)),
  ).toThrow("Async Astro children");
});

test("Astro dynamic booleans distinguish HTML, custom elements and literal attributes", () => {
  expect(
    renderToString(() =>
      h("input", {
        disabled: () => "",
        checked: () => "yes",
        readonly: "false",
        value: "x",
      }),
    ),
  ).toBe('<input checked="" readonly="false" value="x">');
  expect(
    renderToString(() =>
      h("my-field", { disabled: () => false, popover: () => true }),
    ),
  ).toBe('<my-field disabled="false" popover=""></my-field>');
  expect(
    renderToString(() =>
      h("div", {
        alpha: () => false,
        hidden: () => false,
        "data-ready": () => true,
      }),
    ),
  ).toBe('<div alpha="false" data-ready="true"></div>');
});

test("Astro class lists flatten arrays and conditional objects without a dependency", () => {
  expect(
    classList([
      "base",
      [false, "nested"],
      { active: true, hidden: false },
      0,
      2,
    ]),
  ).toBe("base nested active 2");
});

test("Astro styles use CSS values without React units and do not reinterpret HTML property names", () => {
  expect(
    renderToString(() =>
      h("div", {
        style: () => ({
          width: 12,
          backgroundColor: "red",
          "--accent": "blue",
        }),
        htmlFor: "target",
        children: "attribute",
        innerHTML: "<b>",
      }),
    ),
  ).toBe(
    '<div style="width:12;background-color:red;--accent:blue" htmlFor="target" children="attribute" innerHTML="&lt;b&gt;"></div>',
  );
});

test("Astro component props keep type and reference identity", () => {
  const payload = { value: "<&" };
  const Component = (props: { payload: typeof payload }) => {
    expect(props.payload).toBe(payload);
    return h("b", null, props.payload.value);
  };
  expect(renderToString(() => h(Component, { payload }))).toBe(
    "<b>&lt;&amp;</b>",
  );
});

test("Astro component props capture each accessor once before child setup", () => {
  let reads = 0;
  const Component = (props: { value: string }) => {
    props.value += "!";
    return h("p", null, props.value, props.value);
  };
  const html = renderToString(() =>
    h(Component, {
      get value() {
        reads++;
        return "captured";
      },
    }),
  );
  expect(reads).toBe(1);
  expect(html).toBe("<p>captured!captured!</p>");
});

test("rejected async children fail synchronously without leaking an unhandled rejection", async () => {
  expect(() =>
    renderToString(() =>
      h("p", null, () => Promise.reject(new Error("later")) as never),
    ),
  ).toThrow("Async Astro children");
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("Astro pre and textarea retain literal HTML newline serialization", () => {
  for (const tag of ["pre", "textarea"]) {
    for (const body of ["\nx", "\n\nx", "  a\n  b\n"]) {
      expect(renderToString(() => h(tag, null, body))).toBe(
        `<${tag}>${body}</${tag}>`,
      );
    }
  }
});

test("Astro 5 Server Islands (sourceServerIsland) support both eager SSR and deferred placeholder + resolution", () => {
  const UserBadge = (props: { user: string }, slots: SourceSlots = {}) =>
    h(
      "div",
      { class: "badge", "data-user": props.user },
      sourceSlot(slots, "default", "Member"),
    );

  // Eager mode (default): renders component directly and omits the fallback slot from component slots
  const eagerHtml = withAstroContext(
    { url: "https://example.com/" },
    (astro) => {
      const out = renderToString(() =>
        sourceServerIsland(
          UserBadge,
          "UserBadge",
          { user: "ada" },
          {
            default: () => h("span", null, "Admin"),
            fallback: () => h("i", null, "Loading..."),
          },
        ),
      );
      expect(astro.serverIslands).toHaveLength(1);
      expect(astro.serverIslands[0]?.componentName).toBe("UserBadge");
      expect(astro.serverIslands[0]?.hasFallback).toBe(true);
      expect(astro.serverIslands[0]?.deferred).toBe(false);
      return out;
    },
  );
  expect(eagerHtml).toBe(
    '<div class="badge" data-user="ada"><span>Admin</span></div>',
  );

  // Deferred mode (`deferServerIslands: true`): renders <astro-server-island> fallback shell, then resolves on demand
  withAstroContext(
    { url: "https://example.com/", deferServerIslands: true },
    (astro) => {
      const shellHtml = renderToString(() =>
        h(
          "section",
          null,
          sourceServerIsland(
            UserBadge,
            "UserBadge",
            { user: "grace" },
            {
              default: () => h("strong", null, "Architect"),
              fallback: () =>
                h("span", { class: "skeleton" }, "Loading badge..."),
            },
          ),
        ),
      );
      expect(shellHtml).toBe(
        '<section><astro-server-island data-island-id="island-1" data-component="UserBadge"><span class="skeleton">Loading badge...</span></astro-server-island></section>',
      );
      expect(astro.serverIslands).toHaveLength(1);
      expect(astro.resolveServerIsland("island-1")).toBe(
        '<div class="badge" data-user="grace"><strong>Architect</strong></div>',
      );
      expect(astro.resolveAllServerIslands(shellHtml)).toBe(
        '<section><div class="badge" data-user="grace"><strong>Architect</strong></div></section>',
      );
    },
  );
});

test("astro:prefetch records prefetched URLs and supports init()", () => {
  clearPrefetchedUrls();
  expect(getPrefetchedUrls()).toEqual([]);

  init({ defaultStrategy: "tap", prefetchAll: false });
  prefetch("/docs/getting-started");
  prefetch("/docs/getting-started"); // duplicate is deduplicated
  prefetch("https://example.com/pricing", { with: "link" });

  const urls = getPrefetchedUrls();
  expect(urls).toHaveLength(2);
  expect(new URL(urls[0]!).pathname).toBe("/docs/getting-started");
  expect(urls[1]).toBe("https://example.com/pricing");
  clearPrefetchedUrls();
  expect(getPrefetchedUrls()).toEqual([]);
});
