import { describe, expect, test } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("handles null and undefined by returning undefined", () => {
    expect(attributeValue("id", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
    expect(attributeValue("disabled", null, true)).toBeUndefined();
  });

  test("handles standard string values", () => {
    expect(attributeValue("id", "my-id", true)).toBe("my-id");
    expect(attributeValue("class", "my-class", false)).toBe("my-class");
  });

  test("coerces non-string, non-null values to strings", () => {
    expect(attributeValue("tabindex", 0, true)).toBe("0");
    expect(attributeValue("data-value", 123.45, true)).toBe("123.45");
  });

  test("handles boolean attributes in HTML context", () => {
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");
  });

  test("is case-insensitive for HTML boolean attributes", () => {
    expect(attributeValue("DiSaBlEd", true, true)).toBe("");
    expect(attributeValue("ReAdOnLy", false, true)).toBeUndefined();
  });

  test("does not treat boolean attributes as boolean in non-HTML context", () => {
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("disabled", "", false)).toBe("");
  });

  test("handles the hidden attribute", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "", true)).toBe("");
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
  });

  test("handles the translate attribute", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    expect(attributeValue("translate", true, false)).toBe("true");
  });
});

describe("sourceAttributeValue", () => {
  test("retains literal string fast path for non-dynamic attributes", () => {
    expect(sourceAttributeValue("id", "my-id", false)).toBe("my-id");
    expect(sourceAttributeValue("disabled", "disabled", false)).toBe("disabled");
  });

  test("handles null and undefined by returning undefined", () => {
    expect(sourceAttributeValue("id", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", null, true)).toBeUndefined();
  });

  test("casts truthy values to empty string for boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", "some-string", true)).toBe("");
  });

  test("returns undefined for falsy values on boolean attributes (except empty string)", () => {
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("checked", 0, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "", true)).toBe("");
  });

  test("handles SOURCE_BOOLEAN_ADDITIONS", () => {
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("handles SOURCE_BOOLEAN_EXCLUSIONS", () => {
    // alpha is in exclusions, so it shouldn't be treated as boolean
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");
  });

  test("handles the hidden attribute", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe("until-found");
  });

  test("handles the translate attribute", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });
});
