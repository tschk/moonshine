import { expect, test } from "bun:test";
import "../../react/test/dom";
import { createDynamic, Dynamic } from "../src/dynamic";
import {
  createRoot,
  runWithOwner,
  getOwner,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
import { h, renderToString } from "@tschk/moonshine-dom/ssr";
test("entry guard runs before component getters, factories and resources for ownerless or disposed calls", () => {
  let reads = 0,
    setups = 0;
  const component = () => {
    setups++;
    return document.createElement("i");
  };
  const props = {
    get component() {
      reads++;
      return component;
    },
  };
  expect(() => Dynamic(props)).toThrow("live native owner");
  expect(() =>
    createDynamic(() => {
      reads++;
      return component;
    }, {}),
  ).toThrow("live native owner");
  expect(reads).toBe(0);
  expect(setups).toBe(0);
  let owner!: Owner;
  const stop = createRoot((stop) => {
    owner = getOwner()!;
    return stop;
  });
  stop();
  expect(() => runWithOwner(owner, () => Dynamic(props))).toThrow(
    "live native owner",
  );
  expect(reads).toBe(0);
  expect(setups).toBe(0);
});
test("owned function, intrinsic and undefined selections retain behavior and skip irrelevant getters", () => {
  createRoot((stop) => {
    let calls = 0;
    const fn = createDynamic(
      () => () => {
        calls++;
        return "ok";
      },
      {},
    );
    expect(fn()).toBe("ok");
    expect(calls).toBe(1);
    const node = Dynamic({ component: "button", title: "native" });
    expect((node() as HTMLElement).getAttribute("title")).toBe("native");
    const none = Dynamic({
      component: undefined,
      get title() {
        throw Error("not selected");
      },
    });
    expect(none()).toBeUndefined();
    stop();
  });
});
test("SSR guard stays ahead of the owner guard and does not call selection", () => {
  let calls = 0;
  expect(() =>
    renderToString(() =>
      h(() => {
        createDynamic(() => {
          calls++;
          return "p";
        }, {});
        return "";
      }, {}),
    ),
  ).toThrow("explicit /ssr entry");
  expect(calls).toBe(0);
});
