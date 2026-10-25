import { describe, expect, test } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("returns string representation of primitive values", () => {
    expect(attributeValue("class", "foo", true)).toBe("foo");
    expect(attributeValue("tabindex", 0, true)).toBe("0");
    expect(attributeValue("data-value", false, true)).toBe("false");
  });

  test("handles null and undefined by returning undefined", () => {
    expect(attributeValue("class", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
    expect(attributeValue("disabled", null, true)).toBeUndefined();
  });

  test("handles boolean attributes", () => {
    // true values
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");
    // false values return undefined
    expect(attributeValue("disabled", false, true)).toBeUndefined();

    // case insensitivity
    expect(attributeValue("DISABLED", true, true)).toBe("");
  });

  test("handles 'hidden' attribute specially", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("hidden", "", true)).toBe("");
  });

  test("handles 'translate' attribute specially", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
  });

  test("does not process boolean attributes specially if html is false", () => {
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
  });
});

describe("sourceAttributeValue", () => {
  test("returns fast path for literal strings when not dynamic", () => {
    expect(sourceAttributeValue("class", "foo", false)).toBe("foo");
    expect(sourceAttributeValue("class", "foo", true)).toBe("foo");
  });

  test("handles boolean attributes and source additions", () => {
    // Regular boolean
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();

    // Source addition (not a standard HTML boolean but treated as one here)
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("respects source exclusions", () => {
    // 'itemscope' is in SOURCE_BOOLEAN_EXCLUSIONS, so it behaves like a regular attribute
    expect(sourceAttributeValue("itemscope", true, true)).toBe("true");
    expect(sourceAttributeValue("itemscope", false, true)).toBe("false");
  });

  test("handles 'hidden' attribute specially", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe("until-found");
  });

  test("handles 'translate' attribute specially", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });

  test("handles null and undefined", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
  });
});
