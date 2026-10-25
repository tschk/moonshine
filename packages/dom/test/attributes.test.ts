import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("returns undefined for null or undefined", () => {
    expect(attributeValue("class", null, false)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles normal attributes", () => {
    expect(attributeValue("class", "foo", false)).toBe("foo");
    expect(attributeValue("id", 123, true)).toBe("123");
    expect(attributeValue("data-value", false, false)).toBe("false");
  });

  test("handles boolean attributes when html is true", () => {
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("DISABLED", true, true)).toBe(""); // Case insensitive
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("disabled", "true", true)).toBe("true");

    // When html is false, boolean attributes are treated as normal
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
  });

  test("handles hidden attribute specially", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("hidden", "", true)).toBe("");
  });

  test("handles translate attribute specially", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    expect(attributeValue("translate", true, false)).toBe("true");
  });
});

describe("sourceAttributeValue", () => {
  test("fast path for static string attributes", () => {
    expect(sourceAttributeValue("class", "foo", false)).toBe("foo");
    expect(sourceAttributeValue("class", "foo", true)).toBe("foo");
    expect(sourceAttributeValue("disabled", "true", false)).toBe("true");
  });

  test("returns undefined for null or undefined", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
    // any truthy value other than "until-found" for hidden, on a boolean attr, returns ""
    expect(sourceAttributeValue("disabled", "true", true)).toBe("");
  });

  test("handles boolean exclusions and additions", () => {
    // alpha is in SOURCE_BOOLEAN_EXCLUSIONS
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");

    // indeterminate is added
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("handles hidden specially", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles translate specially", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });
});
