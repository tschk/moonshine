import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("returns undefined for nullish values", () => {
    expect(attributeValue("id", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
    expect(attributeValue("class", undefined, false)).toBeUndefined();
  });

  test("handles boolean attributes in HTML context", () => {
    // Standard boolean attribute
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");

    // Non-HTML context standard boolean attribute
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");

    // 'hidden' attribute has special behavior
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "", true)).toBe("");
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
  });

  test("handles translate attribute", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "something", true)).toBe("something");

    // Non-HTML context translate attribute
    expect(attributeValue("translate", true, false)).toBe("true");
    expect(attributeValue("translate", false, false)).toBe("false");
  });

  test("stringifies non-boolean/non-special attributes", () => {
    expect(attributeValue("id", "my-id", true)).toBe("my-id");
    expect(attributeValue("data-value", 123, true)).toBe("123");
    expect(attributeValue("aria-expanded", true, true)).toBe("true");
    expect(attributeValue("aria-expanded", false, true)).toBe("false");
  });
});

describe("sourceAttributeValue", () => {
  test("returns undefined for nullish values", () => {
    expect(sourceAttributeValue("id", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
  });

  test("returns string directly for non-dynamic strings (fast path)", () => {
    expect(sourceAttributeValue("disabled", "disabled", false)).toBe(
      "disabled",
    );
    expect(sourceAttributeValue("class", "btn", false)).toBe("btn");
  });

  test("handles standard boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");

    // Dynamic string doesn't take fast path, goes through generic stringification
    expect(sourceAttributeValue("disabled", "disabled", true)).toBe("");
  });

  test("handles boolean attribute additions", () => {
    // 'indeterminate' is in SOURCE_BOOLEAN_ADDITIONS
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
    expect(sourceAttributeValue("indeterminate", "", true)).toBe("");
  });

  test("handles boolean attribute exclusions", () => {
    // 'alpha' is in SOURCE_BOOLEAN_EXCLUSIONS
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");
  });

  test("handles hidden attribute", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "", true)).toBe("");
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles translate attribute", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "something", true)).toBe(
      "something",
    );
  });

  test("stringifies non-boolean/non-special attributes", () => {
    expect(sourceAttributeValue("id", "my-id", true)).toBe("my-id");
    expect(sourceAttributeValue("data-value", 123, true)).toBe("123");
    expect(sourceAttributeValue("aria-expanded", true, true)).toBe("true");
    expect(sourceAttributeValue("aria-expanded", false, true)).toBe("false");
  });
});
