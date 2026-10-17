import { h, renderToString } from "@tschk/moonshine-dom/ssr";
import { expect, test } from "bun:test";
import { toDisplayString, toDisplayStringSSR } from "../src/text";
import { ref } from "../src/reactive";
import { createRoot, createComputed } from "@tschk/moonshine-dom/reactive";

test("interpolation preserves primitive text and never invokes function values", () => {
  let calls = 0;
  const fn = () => {
    calls++;
    return "wrong";
  };
  for (const [value, text] of [
    [null, ""],
    [undefined, ""],
    [false, "false"],
    [true, "true"],
    [0, "0"],
    [NaN, "NaN"],
    [2n, "2"],
    [Symbol("x"), "Symbol(x)"],
    [fn, String(fn)],
  ] as const)
    expect(toDisplayString(value)).toBe(text);
  expect(calls).toBe(0);
});
test("arrays, objects and native refs use pretty JSON with platform toJSON", () => {
  expect(toDisplayString({ a: 1, b: false, u: undefined })).toBe(
    '{\n  "a": 1,\n  "b": false\n}',
  );
  expect(toDisplayString([1, false, undefined, Symbol("s")])).toBe(
    '[\n  1,\n  false,\n  null,\n  "Symbol(s)"\n]',
  );
  expect(toDisplayString(ref({ value: 2 }))).toBe('{\n  "value": 2\n}');
  expect(toDisplayString({ value: ref(false) })).toBe('{\n  "value": false\n}');
  expect(toDisplayString({ toJSON: () => ({ value: 3 }) })).toBe(
    '{\n  "value": 3\n}',
  );
  // Official helper returns undefined here despite its declared string return type.
  expect(toDisplayString({ toJSON: () => undefined })).toBeUndefined();
  expect(toDisplayString({ toString: () => "custom" })).toBe("custom");
  expect(
    toDisplayString(Object.assign(Object.create(null), { value: 2 })),
  ).toBe('{\n  "value": 2\n}');
  expect(toDisplayString({ regexp: /x/g, typed: new Uint8Array([1, 2]) })).toBe(
    '{\n  "regexp": "/x/g",\n  "typed": "1,2"\n}',
  );
});
test("map/set symbols and object map keys preserve Vue coercion hints", () => {
  const hints: string[] = [];
  const key = {
    [Symbol.toPrimitive](hint: string) {
      hints.push(hint);
      return "key";
    },
  };
  expect(toDisplayString(new Map([[key, ref(3)]]))).toBe(
    '{\n  "Map(1)": {\n    "key =>": 3\n  }\n}',
  );
  expect(hints).toEqual(["default"]);
  expect(toDisplayString(new Map([[Symbol(), 1]]))).toBe(
    '{\n  "Map(1)": {\n    "Symbol(0) =>": 1\n  }\n}',
  );
  expect(toDisplayString(new Set([Symbol(), Symbol("s")]))).toBe(
    '{\n  "Set(2)": [\n    "Symbol()",\n    "Symbol(s)"\n  ]\n}',
  );
});
test("JSON/coercion failures retain original errors and do not fall back silently", () => {
  for (const make of [
    (error: Error) => ({
      toJSON() {
        throw error;
      },
    }),
    (error: Error) => ({
      toString() {
        throw error;
      },
    }),
    (error: Error) =>
      new Map([
        [
          {
            [Symbol.toPrimitive]() {
              throw error;
            },
          },
          1,
        ],
      ]),
  ]) {
    const failure = Error("primary");
    let observed;
    try {
      toDisplayString(make(failure));
    } catch (error) {
      observed = error;
    }
    expect(observed).toBe(failure);
  }
  expect(() => toDisplayString({ value: 2n })).toThrow(TypeError);
  const cycle: any = {};
  cycle.self = cycle;
  expect(() => toDisplayString(cycle)).toThrow(TypeError);
});
test("interpolation tracks nested native ref properties and releases owned observers", () => {
  const value = ref({ count: 1 });
  const seen: Array<string | undefined> = [];
  let stop = () => {};
  createRoot((dispose) => {
    stop = dispose;
    createComputed(() => seen.push(toDisplayString(value)));
  });
  value.value.count = 2;
  expect(seen).toEqual(['{\n  "count": 1\n}', '{\n  "count": 2\n}']);
  stop();
  value.value.count = 3;
  expect(seen.length).toBe(2);
});

test("SSR interpolation stringifies the helper result then escapes through the renderer", () => {
  const request = (value: unknown) =>
    renderToString(() => h("p", {}, toDisplayStringSSR(value)));
  expect(request({ toJSON: () => undefined })).toBe("<p>undefined</p>");
  expect(request(null)).toBe("<p></p>");
  expect(request(false)).toBe("<p>false</p>");
  expect(request("<&")).toBe("<p>&lt;&amp;</p>");
});

test("collection conversion uses entries/values and preserves first evaluation errors", () => {
  const map = new Map<unknown, unknown>([[1, 2]]);
  Object.defineProperty(map, Symbol.iterator, {
    value: function* () {
      yield [9, 9];
    },
  });
  expect(toDisplayString(map)).toBe('{\n  "Map(1)": {\n    "1 =>": 2\n  }\n}');
  const iteration = Error("iteration primary");
  Object.defineProperty(map, "entries", {
    value: function* () {
      yield [
        {
          [Symbol.toPrimitive]() {
            throw Error("coercion secondary");
          },
        },
        1,
      ];
      throw iteration;
    },
  });
  let observed;
  try {
    toDisplayString(map);
  } catch (error) {
    observed = error;
  }
  expect(observed).toBe(iteration);
  let reads = 0;
  const failure = Error("second tag read");
  const tagged = {
    get [Symbol.toStringTag]() {
      if (++reads === 2) throw failure;
      return "Object";
    },
  };
  let observedTag;
  try {
    toDisplayString(tagged);
  } catch (error) {
    observedTag = error;
  }
  expect(observedTag).toBe(failure);
  expect(reads).toBe(2);
});

test("tag reads and collection size string-hint evaluation match interpolation order", () => {
  const tags: string[] = [];
  toDisplayString({
    get [Symbol.toStringTag]() {
      tags.push("tag");
      return "Object";
    },
    a: 1,
  });
  expect(tags).toEqual(["tag", "tag", "tag"]);
  for (const kind of ["map", "set"]) {
    const trace: string[] = [];
    const value = kind === "map" ? new Map() : new Set();
    Object.defineProperty(value, "size", {
      get() {
        trace.push("size");
        return {
          [Symbol.toPrimitive](hint: string) {
            trace.push("size:" + hint);
            return 1;
          },
        };
      },
    });
    if (kind === "map")
      Object.defineProperty(value, "entries", {
        value: function* () {
          trace.push("entries");
          yield [
            {
              [Symbol.toPrimitive](hint: string) {
                trace.push("key:" + hint);
                return "key";
              },
            },
            2,
          ];
          trace.push("end");
        },
      });
    else
      Object.defineProperty(value, "values", {
        value: function* () {
          trace.push("values");
          yield 2;
          trace.push("end");
        },
      });
    toDisplayString(value);
    expect(trace).toEqual(
      kind === "map"
        ? ["size", "size:string", "entries", "end", "key:default"]
        : ["size", "size:string", "values", "end"],
    );
  }
});
