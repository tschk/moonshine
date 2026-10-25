import { expect, test } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

test("attributeValue handling", () => {
  // Standard strings and values
  expect(attributeValue("class", "btn", true)).toBe("btn");
  expect(attributeValue("id", 123, true)).toBe("123");

  // Boolean attributes (HTML)
  expect(attributeValue("disabled", true, true)).toBe("");
  expect(attributeValue("disabled", false, true)).toBeUndefined();
  expect(attributeValue("disabled", "", true)).toBe(""); // true condition for empty string
  expect(attributeValue("readonly", "readonly", true)).toBe("readonly");

  // Nullish handling
  expect(attributeValue("class", null, true)).toBeUndefined();
  expect(attributeValue("class", undefined, true)).toBeUndefined();

  // Non-HTML handles everything as strings mostly
  expect(attributeValue("disabled", true, false)).toBe("true");
  expect(attributeValue("disabled", false, false)).toBe("false");
  expect(attributeValue("disabled", null, false)).toBeUndefined();

  // hidden attribute
  expect(attributeValue("hidden", true, true)).toBe("");
  expect(attributeValue("hidden", false, true)).toBeUndefined();
  expect(attributeValue("hidden", "", true)).toBe("");
  expect(attributeValue("hidden", "until-found", true)).toBe("until-found");

  // translate attribute
  expect(attributeValue("translate", true, true)).toBe("yes");
  expect(attributeValue("translate", false, true)).toBe("no");
  expect(attributeValue("translate", true, false)).toBe("true"); // non-HTML
});

test("sourceAttributeValue handling", () => {
  // Static fast path
  expect(sourceAttributeValue("class", "static", false)).toBe("static");
  expect(sourceAttributeValue("class", "static", true)).toBe("static");

  // Standard boolean
  expect(sourceAttributeValue("disabled", true, true)).toBe("");
  expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();

  // Additions
  expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
  expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();

  // Exclusions
  expect(sourceAttributeValue("alpha", true, true)).toBe("true");
  expect(sourceAttributeValue("alpha", false, true)).toBe("false");

  // hidden
  expect(sourceAttributeValue("hidden", true, true)).toBe("");
  expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
  expect(sourceAttributeValue("hidden", "until-found", true)).toBe("until-found");

  // translate
  expect(sourceAttributeValue("translate", true, true)).toBe("yes");
  expect(sourceAttributeValue("translate", false, true)).toBe("no");

  // Nullish
  expect(sourceAttributeValue("class", null, true)).toBeUndefined();
  expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
});
