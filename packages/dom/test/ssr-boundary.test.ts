import { test, expect } from "bun:test";
import {
  boundary,
  h,
  defer,
  renderToString,
  selectBinding,
  optionBinding,
  scopeSSRChild,
  type SSRChild,
} from "../src/ssr";
import { createRoot, onCleanup, getOwner } from "../src/reactive";
import { catchError } from "../src/error";
const boom = new Error("render");
const fail = () => {
  throw boom;
};
test("deferred arrays buffer fully and original cleanup error is preserved", () => {
  const trace: string[] = [];
  expect(
    renderToString(() =>
      boundary(
        () => {
          onCleanup(() => {
            trace.push("internal");
            throw Error("cleanup");
          });
          return [h("b", null, "discard"), defer(fail)];
        },
        (e) => {
          expect(e).toBe(boom);
          expect(trace).toEqual(["internal"]);
          onCleanup(() => trace.push("fallback"));
          return h("p", null, "<&");
        },
      ),
    ),
  ).toBe("<p>&lt;&amp;</p>");
  expect(trace).toEqual(["internal", "fallback"]);
});
test("nested fallback failures reach enclosing buffer", () => {
  expect(
    renderToString(() =>
      boundary(
        () =>
          boundary(fail, () => {
            throw Error("fallback");
          }),
        (e) => h("i", null, (e as Error).message),
      ),
    ),
  ).toBe("<i>fallback</i>");
});
test("selection rollback ordinary and typed, SVG preserved", () => {
  for (const typed of [false, true]) {
    const key = {};
    const props = typed ? { [selectBinding]: { value: key } } : { value: "x" };
    const option = () =>
      h(
        "option",
        typed ? { [optionBinding]: { value: key } } : { value: "x" },
        "X",
      );
    expect(
      renderToString(() =>
        h(
          "select",
          props,
          boundary(
            () => [option(), defer(fail)],
            () => option(),
          ),
        ),
      ),
    ).toBe(
      typed
        ? '<select><option value="[object Object]" selected="">X</option></select>'
        : '<select><option value="x" selected="">X</option></select>',
    );
  }
  expect(
    renderToString(() =>
      h(
        "svg",
        null,
        boundary(fail, () => h("g", { hidden: false }, h("text", null, "<&"))),
      ),
    ),
  ).toBe('<svg><g hidden="false"><text>&lt;&amp;</text></g></svg>');
});
test("boundary intercepts fresh setup before outer generic handler", () => {
  const errors: unknown[] = [];
  expect(
    renderToString(() =>
      catchError(
        () =>
          boundary(
            () =>
              h(() => {
                throw boom;
              }, {}),
            (e) => h("b", null, (e as Error).message),
          ),
        (e) => errors.push(e),
      ),
    ),
  ).toBe("<b>render</b>");
  expect(errors).toEqual([]);
});
test("serialization guards and cancellation never initializes fallback", () => {
  let fallbacks = 0;
  createRoot((stop) => {
    const node = boundary(
      () => {
        stop();
        return h("p");
      },
      () => {
        fallbacks++;
        return "fallback";
      },
    );
    // Serialize within the owner that the callback cancels.
    expect(() => {
      const symbols = Object.getOwnPropertySymbols(node);
      Reflect.get(node, symbols[0])();
    }).toThrow("disposed during rendering");
  });
  expect(fallbacks).toBe(0);
  const node = boundary(() => "ok", fail);
  expect(() =>
    Reflect.get(node, Object.getOwnPropertySymbols(node)[0])(),
  ).toThrow("live native owner");
});
test("text-only contexts reject HTML boundary instead of swallowing context error", () => {
  expect(() =>
    renderToString(() =>
      h(
        "title",
        null,
        boundary(fail, () => "text"),
      ),
    ),
  ).toThrow("must be text");
});
test("captured external scopes retain lexical handler policy (explicit limitation)", () => {
  const trace: string[] = [];
  let captured!: SSRChild;
  expect(
    renderToString(() =>
      catchError(
        () => {
          captured = scopeSSRChild(
            defer(() =>
              h(() => {
                throw boom;
              }, {}),
            ),
          );
          return boundary(
            () => captured,
            () => {
              trace.push("fallback");
              return "fallback";
            },
          );
        },
        () => trace.push("outer"),
      ),
    ),
  ).toBe("");
  expect(trace).toEqual(["outer"]);
});
test("failed fallback keeps its error and cleans every internal peer", () => {
  const fallbackError = Error("fallback");
  const trace: number[] = [];
  expect(() =>
    renderToString(() =>
      boundary(fail, () => {
        onCleanup(() => {
          trace.push(1);
          throw Error("cleanup");
        });
        onCleanup(() => trace.push(2));
        throw fallbackError;
      }),
    ),
  ).toThrow(fallbackError);
  expect(trace).toEqual([1, 2]);
});
test("successful branch owner lives until request cleanup, boundary does not mount DOM", () => {
  const trace: string[] = [];
  expect(
    renderToString(() => [
      boundary(() => {
        onCleanup(() => trace.push("cleanup"));
        return "<&";
      }, fail),
      defer(() => {
        expect(trace).toEqual([]);
        return "!";
      }),
    ]),
  ).toBe("&lt;&amp;!");
  expect(trace).toEqual(["cleanup"]);
});
test("cleanup cancellation suppresses fallback even when original render failed", () => {
  let fallbackCalls = 0;
  createRoot((stop) => {
    const node = boundary(
      () => {
        onCleanup(stop);
        throw boom;
      },
      () => {
        fallbackCalls++;
        return "fallback";
      },
    );
    expect(() =>
      Reflect.get(node, Object.getOwnPropertySymbols(node)[0])(),
    ).toThrow(boom);
  });
  expect(fallbackCalls).toBe(0);
});
test("pre-created boundary resolves current request context without leaking it", () => {
  const key = Symbol();
  const node = boundary(() => String(getOwner()!.context!.get(key)), fail);
  for (const value of ["one", "two"])
    expect(
      renderToString(() => {
        const owner = getOwner()!;
        owner.context = new Map(owner.context);
        owner.context.set(key, value);
        return node;
      }),
    ).toBe(value);
});
