import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("handles null or undefined values", () => {
    expect(attributeValue("class", null, false)).toBeUndefined();
    expect(attributeValue("class", undefined, false)).toBeUndefined();
  });

  test("handles boolean attributes when html is true", () => {
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");
  });

  test("handles hidden attribute", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("hidden", "", true)).toBe("");
  });

  test("handles boolean attributes when html is false", () => {
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("hidden", true, false)).toBe("true");
  });

  test("handles translate attribute", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    expect(attributeValue("translate", true, false)).toBe("true");
  });

  test("returns string representation for other attributes", () => {
    expect(attributeValue("class", "foo", true)).toBe("foo");
    expect(attributeValue("class", 123, true)).toBe("123");
    expect(attributeValue("tabindex", 0, true)).toBe("0");
    expect(attributeValue("id", false, true)).toBe("false");
  });

  test("handles case-insensitivity for html attributes", () => {
    expect(attributeValue("DISABLED", true, true)).toBe("");
    expect(attributeValue("Translate", true, true)).toBe("yes");
  });
});

describe("sourceAttributeValue", () => {
  test("handles non-dynamic string fast path", () => {
    expect(sourceAttributeValue("class", "foo", false)).toBe("foo");
    expect(sourceAttributeValue("disabled", "disabled", false)).toBe(
      "disabled",
    );
  });

  test("handles null or undefined values", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, false)).toBeUndefined();
  });

  test("handles standard boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
    expect(sourceAttributeValue("disabled", "disabled", true)).toBe("");
  });

  test("handles SOURCE_BOOLEAN_EXCLUSIONS", () => {
    expect(sourceAttributeValue("shadowrootclonable", true, true)).toBe("true");
  });

  test("handles SOURCE_BOOLEAN_ADDITIONS", () => {
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
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
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });

  test("returns string representation for other attributes", () => {
    expect(sourceAttributeValue("class", "foo", true)).toBe("foo");
    expect(sourceAttributeValue("class", 123, true)).toBe("123");
    expect(sourceAttributeValue("tabindex", 0, true)).toBe("0");
    expect(sourceAttributeValue("id", false, true)).toBe("false");
  });
});
