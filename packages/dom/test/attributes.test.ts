import { describe, expect, test } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("returns stringified value for non-boolean attributes", () => {
    expect(attributeValue("class", "my-class", true)).toBe("my-class");
    expect(attributeValue("id", 123, true)).toBe("123");
  });

  test("drops undefined and null", () => {
    expect(attributeValue("class", undefined, true)).toBeUndefined();
    expect(attributeValue("class", null, true)).toBeUndefined();
  });

  test("handles html boolean attributes correctly", () => {
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("checked", true, true)).toBe("");
  });

  test("handles non-html boolean attributes as normal attributes", () => {
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("disabled", "", false)).toBe("");
  });

  test("handles the hidden attribute", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "", true)).toBe("");
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("hidden", "other", true)).toBe("other");
  });

  test("handles translate attribute conversion", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    expect(attributeValue("translate", true, false)).toBe("true");
  });
});

describe("sourceAttributeValue", () => {
  test("returns unmodified string when not dynamic", () => {
    expect(sourceAttributeValue("class", "my-class", false)).toBe("my-class");
  });

  test("stringifies when dynamic", () => {
    expect(sourceAttributeValue("class", 123, true)).toBe("123");
    expect(sourceAttributeValue("class", "123", true)).toBe("123");
  });

  test("drops undefined and null", () => {
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
  });

  test("handles standard html boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
  });

  test("handles SOURCE_BOOLEAN_ADDITIONS", () => {
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("seamless", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("handles SOURCE_BOOLEAN_EXCLUSIONS", () => {
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");
  });

  test("handles the hidden attribute", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "", true)).toBe("");
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
    // "other" triggers the boolean branch, getting output as empty string
    expect(sourceAttributeValue("hidden", "other", true)).toBe("");
  });

  test("handles translate attribute conversion", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });
});
