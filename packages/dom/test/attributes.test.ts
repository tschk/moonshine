import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("returns string representation for normal attributes", () => {
    expect(attributeValue("id", "my-id", true)).toBe("my-id");
    expect(attributeValue("tabindex", 0, true)).toBe("0");
  });

  test("omits attribute if value is null or undefined", () => {
    expect(attributeValue("id", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, false)).toBeUndefined();
  });

  test("handles HTML boolean attributes", () => {
    // true creates an empty string
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("DISABLED", true, true)).toBe("");

    // string true creates the string itself
    expect(attributeValue("disabled", "true", true)).toBe("true");

    // false, null, undefined removes the attribute (returns undefined)
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", null, true)).toBeUndefined();
    expect(attributeValue("disabled", undefined, true)).toBeUndefined();

    // empty string keeps the empty string
    expect(attributeValue("disabled", "", true)).toBe("");
  });

  test("handles the special HTML hidden attribute", () => {
    // hidden boolean logic
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();

    // until-found should be passed as string
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
  });

  test("handles the special HTML translate attribute", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
  });

  test("HTML booleans are not applied to non-HTML (like SVG)", () => {
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("hidden", true, false)).toBe("true");
    expect(attributeValue("translate", true, false)).toBe("true");
  });
});

describe("sourceAttributeValue", () => {
  test("returns string value directly if not dynamic and value is string", () => {
    expect(sourceAttributeValue("id", "my-id", false)).toBe("my-id");
  });

  test("omits attribute if value is null or undefined", () => {
    expect(sourceAttributeValue("id", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles generic boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
  });

  test("handles SOURCE_BOOLEAN_ADDITIONS", () => {
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("handles SOURCE_BOOLEAN_EXCLUSIONS", () => {
    // alpha is an exclusion, so it's not a boolean attribute here
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");
  });

  test("handles the special hidden attribute", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();

    // until-found passes through as non-boolean
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles the special translate attribute", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
  });
});
