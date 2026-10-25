import { describe, expect, test } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("handles nullish values", () => {
    expect(attributeValue("class", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles standard string values", () => {
    expect(attributeValue("class", "foo", true)).toBe("foo");
    expect(attributeValue("id", "bar", false)).toBe("bar");
  });

  test("handles boolean attributes in HTML context", () => {
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");
  });

  test("handles boolean attributes in non-HTML context", () => {
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("disabled", "", false)).toBe("");
  });

  test("case insensitivity for boolean attributes", () => {
    expect(attributeValue("DISABLED", true, true)).toBe("");
  });

  test("special 'hidden' attribute handling", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("hidden", "", true)).toBe("");
  });

  test("special 'translate' attribute handling", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    expect(attributeValue("translate", true, false)).toBe("true");
  });
});

describe("sourceAttributeValue", () => {
  test("static string fast path", () => {
    expect(sourceAttributeValue("class", "foo", false)).toBe("foo");
  });

  test("handles nullish values", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
  });

  test("boolean attributes excluding exclusions", () => {
    // 'disabled' is a standard boolean
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();

    // 'alpha' is in SOURCE_BOOLEAN_EXCLUSIONS, so it should be treated as non-boolean
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");
  });

  test("boolean attributes additions", () => {
    // 'indeterminate' is in SOURCE_BOOLEAN_ADDITIONS
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("special 'hidden' handling in source", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    // In source, hidden !== 'until-found' is treated as boolean.
    // 'until-found' should not be treated as a boolean (boolean = false), returning String(value)
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("special 'translate' handling in source", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });
});
