import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes.ts";

describe("attributeValue", () => {
  test("returns undefined for null or undefined", () => {
    expect(attributeValue("class", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles boolean attributes", () => {
    // html = true
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");

    // lowercases
    expect(attributeValue("DISABLED", true, true)).toBe("");

    // html = false (no boolean attribute behavior)
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("disabled", "", false)).toBe("");
  });

  test("handles hidden attribute", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("hidden", "", true)).toBe("");
  });

  test("handles translate attribute", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    expect(attributeValue("translate", true, false)).toBe("true"); // non-html
  });

  test("stringifies other values", () => {
    expect(attributeValue("class", "btn", true)).toBe("btn");
    expect(attributeValue("class", 123, true)).toBe("123");
    expect(attributeValue("tabindex", 0, true)).toBe("0");
    expect(attributeValue("tabindex", false, true)).toBe("false");
  });
});

describe("sourceAttributeValue", () => {
  test("returns literal strings for static attributes", () => {
    expect(sourceAttributeValue("class", "btn", false)).toBe("btn");
    expect(sourceAttributeValue("disabled", "disabled", false)).toBe(
      "disabled",
    );
  });

  test("returns undefined for null or undefined", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles boolean attributes and additions", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();

    // SOURCE_BOOLEAN_ADDITIONS
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("handles boolean exclusions", () => {
    // SOURCE_BOOLEAN_EXCLUSIONS like "itemscope"
    expect(sourceAttributeValue("itemscope", true, true)).toBe("true");
    expect(sourceAttributeValue("itemscope", false, true)).toBe("false");
  });

  test("handles hidden attribute", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles translate attribute", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
  });

  test("stringifies other values", () => {
    expect(sourceAttributeValue("class", "btn", true)).toBe("btn");
    expect(sourceAttributeValue("class", 123, true)).toBe("123");
    expect(sourceAttributeValue("tabindex", 0, true)).toBe("0");
  });
});
