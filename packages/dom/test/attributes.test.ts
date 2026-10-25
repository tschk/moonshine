import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("handles nullish and empty values", () => {
    expect(attributeValue("class", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
    expect(attributeValue("class", "", true)).toBe("");
  });

  test("handles normal attributes", () => {
    expect(attributeValue("class", "foo", true)).toBe("foo");
    expect(attributeValue("tabindex", 0, true)).toBe("0");
    expect(attributeValue("data-foo", false, true)).toBe("false");
  });

  test("handles boolean HTML attributes", () => {
    // True/truthy values
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", "true", true)).toBe("true");

    // False values should return undefined for HTML boolean attributes
    expect(attributeValue("disabled", false, true)).toBeUndefined();

    // Case insensitive for name
    expect(attributeValue("DISABLED", true, true)).toBe("");

    // When html is false, boolean attributes act as normal attributes
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
  });

  test("handles hidden attribute specially", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    // "hidden" with html=false
    expect(attributeValue("hidden", true, false)).toBe("true");
  });

  test("handles translate attribute specially", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    // Only normalizes booleans
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    // Not special when html is false
    expect(attributeValue("translate", true, false)).toBe("true");
  });
});

describe("sourceAttributeValue", () => {
  test("returns early for non-dynamic strings", () => {
    expect(sourceAttributeValue("class", "foo", false)).toBe("foo");
    expect(sourceAttributeValue("disabled", "true", false)).toBe("true");
  });

  test("handles nullish values", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles normal attributes", () => {
    expect(sourceAttributeValue("class", "foo", true)).toBe("foo");
    expect(sourceAttributeValue("tabindex", 0, true)).toBe("0");
    // Notice sourceAttributeValue is case sensitive for boolean attribute check
    expect(sourceAttributeValue("DISABLED", true, true)).toBe("true");
  });

  test("handles SOURCE_BOOLEAN_ADDITIONS", () => {
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
    expect(sourceAttributeValue("seamless", true, true)).toBe("");
  });

  test("handles SOURCE_BOOLEAN_EXCLUSIONS", () => {
    // Excluded standard boolean attributes
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("itemscope", true, true)).toBe("true");
  });

  test("handles hidden attribute specially", () => {
    // hidden true -> boolean true -> ""
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    // hidden "until-found" -> boolean false -> "until-found"
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles translate attribute specially", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });
});
