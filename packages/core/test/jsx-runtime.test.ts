import { describe, expect, test } from "bun:test";
import { jsx, jsxs, Fragment } from "../src/jsx-runtime";
import {
  jsx as reactJsx,
  jsxs as reactJsxs,
  Fragment as reactFragment,
} from "react/jsx-runtime";

describe("jsx-runtime", () => {
  test("re-exports react/jsx-runtime correctly", () => {
    expect(jsx).toBe(reactJsx);
    expect(jsxs).toBe(reactJsxs);
    expect(Fragment).toBe(reactFragment);
  });
});
