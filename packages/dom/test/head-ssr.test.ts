import { scopeSSRChild } from "../src/ssr";
import { expect, test } from "bun:test";
import { boundary, defer, h, renderToString } from "../src/ssr";
import { onCleanup } from "../src/reactive";
import { head, renderWithHead, title } from "../src/head-ssr";

const boom = new Error("head");
const fail = () => {
  throw boom;
};

test("head fragments and title are escaped, ordered and kept out of the body", () => {
  expect(
    renderWithHead(() => {
      title(() => "A & <B>");
      head(() => h("meta", { name: "d", content: 'x"<&' }));
      head(() => h("link", { rel: "icon", href: "/a?b=1&c=2" }));
      return h("main", null, "body");
    }),
  ).toEqual({
    body: "<main>body</main>",
    head:
      '<meta name="d" content="x&quot;&lt;&amp;">' +
      '<link rel="icon" href="/a?b=1&amp;c=2">' +
      "<title>A &amp; &lt;B&gt;</title>",
  });
});

test("last title wins at the end, ordinary metas are not deduplicated, empty title is declared", () => {
  expect(
    renderWithHead(() => {
      title(() => "first");
      head(() => h("meta", { name: "a", content: "1" }));
      head(() => h("meta", { name: "a", content: "1" }));
      title(() => "second");
      head(() => h("meta", { name: "b", content: "2" }));
      return null;
    }),
  ).toEqual({
    body: "",
    head:
      '<meta name="a" content="1"><meta name="a" content="1">' +
      '<meta name="b" content="2"><title>second</title>',
  });
  expect(renderWithHead(() => title(() => "")).head).toBe("<title></title>");
});

test("fresh requests share no head state", () => {
  expect(renderWithHead(() => (title(() => "one"), "a")).head).toBe(
    "<title>one</title>",
  );
  expect(renderWithHead(() => "b")).toEqual({ body: "b", head: "" });
});

test("nested renderWithHead collectors are isolated", () => {
  let inner!: { body: string; head: string };
  const outer = renderWithHead(() => {
    title(() => "outer");
    inner = renderWithHead(() => {
      title(() => "inner");
      head(() => h("meta", { name: "i" }));
      return "in";
    });
    head(() => h("meta", { name: "o" }));
    return "out";
  });
  expect(inner).toEqual({
    body: "in",
    head: '<meta name="i"><title>inner</title>',
  });
  expect(outer).toEqual({
    body: "out",
    head: '<meta name="o"><title>outer</title>',
  });
});

test("head and title require a live server render with a collector", () => {
  expect(() => head(() => h("meta", null))).toThrow("renderWithHead");
  expect(() => title(() => "x")).toThrow("renderWithHead");
  expect(() => renderToString(() => (title(() => "x"), ""))).toThrow(
    "renderWithHead",
  );
  expect(() => renderToString(() => (head(() => ""), ""))).toThrow(
    "renderWithHead",
  );
});

test("head children live until the outer root disposes and render errors propagate", () => {
  const trace: string[] = [];
  renderWithHead(() => {
    head(() => {
      onCleanup(() => trace.push("cleanup"));
      return h("meta", { name: "c" });
    });
    trace.push("body");
    return "x";
  });
  expect(trace).toEqual(["body", "cleanup"]);

  trace.length = 0;
  expect(() =>
    renderWithHead(() => {
      head(() => {
        onCleanup(() => trace.push("failed"));
        return fail();
      });
      return "x";
    }),
  ).toThrow(boom);
  expect(trace).toEqual(["failed"]);
  expect(() =>
    renderWithHead(() => {
      title(fail);
      return "x";
    }),
  ).toThrow(boom);
});

test("discarded boundary head and title are excluded while accepted fallback publishes", () => {
  expect(
    renderWithHead(() => [
      title(() => "outside"),
      boundary(
        () => [
          defer(() => {
            title(() => "rejected");
            head(() => h("meta", { name: "rejected" }));
            return "bad";
          }),
          defer(fail),
        ],
        (error) => {
          expect(error).toBe(boom);
          title(() => "fallback");
          head(() => h("meta", { name: "fallback" }));
          return h("p", null, "fb");
        },
      ),
    ]),
  ).toEqual({
    body: "<p>fb</p>",
    head: '<meta name="fallback"><title>fallback</title>',
  });
});

test("accepted inner boundary head is excluded when an enclosing attempt is discarded", () => {
  expect(
    renderWithHead(() =>
      boundary(
        () => [
          boundary(
            () => {
              title(() => "inner");
              head(() => h("meta", { name: "inner" }));
              return "ok";
            },
            () => "unused",
          ),
          defer(fail),
        ],
        () => {
          head(() => h("meta", { name: "outer-fallback" }));
          return "fb";
        },
      ),
    ),
  ).toEqual({ body: "fb", head: '<meta name="outer-fallback">' });
});

test("title reuses scoped text serialization without double escaping or accepting HTML", () => {
  expect(
    renderWithHead(() => {
      title(() => scopeSSRChild(() => "<&"));
      return null;
    }).head,
  ).toBe("<title>&lt;&amp;</title>");
  expect(() =>
    renderWithHead(() => {
      title(() => h("b", null, "not title text"));
      return null;
    }),
  ).toThrow("children must be text");
});

test("first title in each head wins while a later head overrides it", () => {
  expect(
    renderWithHead(() =>
      head(() => [title(() => "  one  "), title(() => "two")]),
    ).head,
  ).toBe("<title>  one  </title>");
  expect(
    renderWithHead(() => [
      head(() => [title(() => "one"), title(() => "two")]),
      head(() => title(() => "later")),
    ]).head,
  ).toBe("<title>later</title>");
});

test("nested collectors finish independently inside an enclosing boundary", () => {
  let inner: { body: string; head: string } | undefined;
  renderWithHead(() =>
    boundary(
      () =>
        defer(() => {
          inner = renderWithHead(() => [title(() => "inner"), "nested"]);
          return "outer";
        }),
      () => "fallback",
    ),
  );
  expect(inner).toEqual({ body: "nested", head: "<title>inner</title>" });
});

test("discarded boundaries suppress head from lexically scoped children", () => {
  const result = renderWithHead(() => {
    const child = h(
      "div",
      null,
      defer(() => [title(() => "leak"), "child"]),
    );
    return boundary(
      () => [child, defer(fail)],
      () => "fallback",
    );
  });
  expect(result).toEqual({ body: "fallback", head: "" });
});

test("caught head setup failures discard nested declarations", () => {
  expect(
    renderWithHead(() => {
      try {
        head(() => {
          title(() => "leak");
          head(() => h("meta", { name: "leak" }));
          throw boom;
        });
      } catch {}
      return "body";
    }),
  ).toEqual({ body: "body", head: "" });
});

test("nested plain SSR roots cannot publish into the outer collector", () => {
  renderWithHead(() => {
    expect(() => renderToString(() => title(() => "nested"))).toThrow(
      "renderWithHead",
    );
    return "body";
  });
});
