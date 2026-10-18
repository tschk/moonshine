import { expect, test } from "bun:test";
import { spreadServerEntries } from "../src/spread-element-server";
import { hAttributeEntries, renderToString } from "@tschk/moonshine-dom/ssr";

test("layers merge in order with later values winning at the first key position", () => {
  expect(
    spreadServerEntries([
      { a: "1", b: "2" },
      { c: "3", a: "4" },
    ]),
  ).toEqual([
    ["a", "4"],
    ["b", "2"],
    ["c", "3"],
  ]);
  expect(spreadServerEntries([])).toEqual([]);
});

test("nullish layers and values are ignored", () => {
  expect(
    spreadServerEntries([null, undefined, { a: null, b: undefined, c: 0 }]),
  ).toEqual([
    ["a", undefined],
    ["b", undefined],
    ["c", "0"],
  ]);
  expect(spreadServerEntries([{ a: "1" }, { a: null }])).toEqual([
    ["a", undefined],
  ]);
});

test("getters run exactly once, including when a later layer overrides them", () => {
  const events: string[] = [];
  const entries = spreadServerEntries([
    {
      get a() {
        events.push("a");
        return "first";
      },
      get fn() {
        events.push("fn");
        return () => {
          throw new Error("function data must not run");
        };
      },
    },
    { a: "second" },
    {
      get b() {
        events.push("b");
        return "third";
      },
    },
  ]);
  expect(entries).toEqual([
    ["a", "second"],
    ["b", "third"],
  ]);
  expect(events).toEqual(["a", "fn", "b"]);
});

test("merging is prototype safe and ignores inherited properties and symbols", () => {
  const inherited = Object.create({ inherited: "no" });
  inherited.own = "yes";
  const symbol = Symbol("attribute");
  const polluted = JSON.parse('{"__proto__":{"polluted":"yes"},"x":"1"}');
  const entries = spreadServerEntries([
    inherited,
    { [symbol]: "symbol", plain: "1" },
    polluted,
  ]);
  expect(entries).toEqual([
    ["own", "yes"],
    ["plain", "1"],
    ["__proto__", "[object Object]"],
    ["x", "1"],
  ]);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.hasOwn(polluted, "__proto__")).toBe(true);
});

test("names lowercase and unsupported functions, events, internals and invalid names drop", () => {
  const entries = spreadServerEntries([
    {
      Title: "t",
      "data-x": "1",
      "xlink:href": "#a",
      _private: "p",
      fn: () => "no",
      onclick: "no",
      onClick: "no",
      on: "no",
      $$slots: "no",
      "bad name": "no",
      "a=b": "no",
      'a"b': "no",
      "1a": "no",
      "": "no",
    },
  ]);
  expect(entries).toEqual([
    ["title", "t"],
    ["data-x", "1"],
    ["xlink:href", "#a"],
    ["_private", "p"],
  ]);
});

test("source boolean, hidden and translate semantics are pre-encoded", () => {
  expect(
    spreadServerEntries([
      {
        disabled: true,
        checked: false,
        Required: "",
        open: 0,
        indeterminate: 1,
        hidden: "until-found",
        translate: false,
        itemscope: true,
        alpha: true,
      },
      { hidden: true },
    ]),
  ).toEqual([
    ["disabled", ""],
    ["checked", undefined],
    ["required", ""],
    ["open", undefined],
    ["indeterminate", ""],
    ["hidden", ""],
    ["translate", "no"],
    ["itemscope", "true"],
    ["alpha", "true"],
  ]);
  expect(
    spreadServerEntries([{ hidden: "until-found", translate: true }]),
  ).toEqual([
    ["hidden", "until-found"],
    ["translate", "yes"],
  ]);
});

test("class uses the existing normalizer while other casings stay ordinary data", () => {
  expect(
    spreadServerEntries([{ class: ["a", false, { b: true, c: 0 }] }]),
  ).toEqual([["class", "a b"]]);
  expect(spreadServerEntries([{ class: [] }, { id: "x" }])).toEqual([
    ["class", undefined],
    ["id", "x"],
  ]);
  expect(
    spreadServerEntries([{ class: ["a"] }, { class: { b: true } }]),
  ).toEqual([["class", "b"]]);
  expect(spreadServerEntries([{ Class: ["a", "b"] }])).toEqual([
    ["class", "a,b"],
  ]);
});

test("style stringifies nonnull values without source style parsing", () => {
  expect(
    spreadServerEntries([{ style: "color:red" }, { style: null }]),
  ).toEqual([["style", undefined]]);
  expect(spreadServerEntries([{ style: 0 }])).toEqual([["style", "0"]]);
  expect(spreadServerEntries([{ style: { color: "red" } }])).toEqual([
    ["style", "[object Object]"],
  ]);
});

test("ref and children string data stay ordinary attributes while functions never run", () => {
  let calls = 0;
  const handler = () => {
    calls++;
  };
  expect(
    spreadServerEntries([
      { ref: "element", children: "text" },
      { ref: handler },
      { children: handler },
    ]),
  ).toEqual([]);
  expect(calls).toBe(0);
  expect(spreadServerEntries([{ ref: "element", children: "text" }])).toEqual([
    ["ref", "element"],
    ["children", "text"],
  ]);
});

test("entries serialize through hAttributeEntries with escaped values and unchanged children", () => {
  const entries = spreadServerEntries([
    {
      id: "a",
      class: ["x", { y: true }],
      disabled: true,
      hidden: false,
      ref: "r<",
      children: "c&",
      onclick: "alert(1)",
    },
    { id: "b", title: `"<&'>x`, translate: false },
  ]);
  expect(renderToString(() => hAttributeEntries("div", entries, "body"))).toBe(
    `<div id="b" class="x y" disabled="" ref="r&lt;" children="c&amp;" title="&quot;&lt;&amp;&#39;&gt;x" translate="no">body</div>`,
  );
  expect(renderToString(() => hAttributeEntries("input", entries))).toBe(
    `<input id="b" class="x y" disabled="" ref="r&lt;" children="c&amp;" title="&quot;&lt;&amp;&#39;&gt;x" translate="no">`,
  );
});
