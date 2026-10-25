import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("returns undefined for nullish values", () => {
    expect(attributeValue("class", null, false)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles non-HTML attributes by stringifying values", () => {
    expect(attributeValue("custom-attr", 123, false)).toBe("123");
    expect(attributeValue("custom-attr", false, false)).toBe("false");
    expect(attributeValue("custom-attr", true, false)).toBe("true");

    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("disabled", true, false)).toBe("true");
  });

  test("handles HTML boolean attributes", () => {
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", null, true)).toBeUndefined();
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("disabled", "x", true)).toBe("x");
  });

  test("handles the HTML hidden attribute", () => {
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("hidden", "x", true)).toBe("x");
  });

  test("handles the HTML translate attribute", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
  });
});

describe("sourceAttributeValue", () => {
  test("returns literal string on fast path for static strings", () => {
    expect(sourceAttributeValue("class", "literal", false)).toBe("literal");
  });

  test("returns undefined for nullish values", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, false)).toBeUndefined();
  });

  test("handles source boolean attributes", () => {
    // Both in HTML and source
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
    expect(sourceAttributeValue("disabled", "x", true)).toBe("");

    // Added in source
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");

    // Excluded in source
    expect(sourceAttributeValue("itemscope", true, true)).toBe("true");
    expect(sourceAttributeValue("itemscope", false, true)).toBe("false");
  });

  test("handles the hidden attribute", () => {
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", "x", true)).toBe("");
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles the translate attribute", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });
});
