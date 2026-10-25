import { describe, expect, test } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("handles null and undefined values", () => {
    expect(attributeValue("class", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
    expect(attributeValue("class", null, false)).toBeUndefined();
  });

  test("handles standard string values", () => {
    expect(attributeValue("class", "button", true)).toBe("button");
    expect(attributeValue("class", "button", false)).toBe("button");
    expect(attributeValue("data-id", 123, true)).toBe("123");
  });

  test("handles boolean attributes in HTML mode", () => {
    // True values become empty string
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("readonly", true, true)).toBe("");

    // False values become undefined
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", null, true)).toBeUndefined();

    // Empty string is kept
    expect(attributeValue("disabled", "", true)).toBe("");

    // Truthy string values are converted to string
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");
  });

  test("handles non-HTML mode (XML/SVG)", () => {
    // Boolean mapping does not apply
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("hidden", true, false)).toBe("true");
    expect(attributeValue("translate", true, false)).toBe("true");
  });

  test("handles 'hidden' attribute special cases", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("hidden", "", true)).toBe("");
  });

  test("handles 'translate' attribute special cases", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
  });

  test("matches boolean attribute names case-insensitively", () => {
    expect(attributeValue("DISABLED", true, true)).toBe("");
  });

  test("stringifies falsy values on non-boolean attributes", () => {
    expect(attributeValue("tabindex", 0, true)).toBe("0");
    expect(attributeValue("data-foo", false, true)).toBe("false");
  });
});

describe("sourceAttributeValue", () => {
  test("returns static strings immediately when not dynamic", () => {
    expect(sourceAttributeValue("class", "button", false)).toBe("button");
    expect(sourceAttributeValue("disabled", "disabled", false)).toBe(
      "disabled",
    );
  });

  test("evaluates non-string static values", () => {
    expect(sourceAttributeValue("class", 123, false)).toBe("123");
  });

  test("handles null and undefined values", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
    expect(sourceAttributeValue("class", null, false)).toBeUndefined();
  });

  test("handles standard HTML boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
    // In compiler source, any truthy value for a boolean attribute yields ""
    expect(sourceAttributeValue("disabled", "disabled", true)).toBe("");
  });

  test("handles SOURCE_BOOLEAN_ADDITIONS", () => {
    // indeterminate is added as a boolean attribute in source semantics
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
    expect(sourceAttributeValue("indeterminate", "yes", true)).toBe("");
  });

  test("handles SOURCE_BOOLEAN_EXCLUSIONS", () => {
    // alpha is excluded from boolean evaluation in source semantics
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");
  });

  test("handles 'hidden' attribute special cases", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    // 'until-found' is treated non-boolean
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
    expect(sourceAttributeValue("hidden", "", true)).toBe("");
  });

  test("handles 'translate' attribute special cases", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });

  test("matches boolean attribute names case-sensitively", () => {
    expect(sourceAttributeValue("DISABLED", true, true)).toBe("true");
  });

  test("stringifies falsy values on non-boolean attributes", () => {
    expect(sourceAttributeValue("tabindex", 0, true)).toBe("0");
  });
});
