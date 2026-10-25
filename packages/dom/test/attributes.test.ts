import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("returns undefined for nullish values", () => {
    expect(attributeValue("class", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
    expect(attributeValue("class", null, false)).toBeUndefined();
    expect(attributeValue("class", undefined, false)).toBeUndefined();
  });

  test("handles boolean attributes in HTML mode", () => {
    // true -> ""
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("readonly", true, true)).toBe("");
    expect(attributeValue("ReAdOnLy", true, true)).toBe(""); // mixed case

    // false -> undefined
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("readonly", false, true)).toBeUndefined();

    // "" -> ""
    expect(attributeValue("disabled", "", true)).toBe("");

    // truthy string -> stringified
    expect(attributeValue("disabled", "true", true)).toBe("true");
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");
  });

  test("does not handle boolean attributes in non-HTML mode", () => {
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("disabled", "", false)).toBe("");
  });

  test("handles hidden attribute specifically", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "", true)).toBe("");
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
  });

  test("handles translate attribute specifically in HTML mode", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    expect(attributeValue("translate", "no", true)).toBe("no");

    // mixed case
    expect(attributeValue("TRANSLATE", true, true)).toBe("yes");
  });

  test("does not apply translate mapping in non-HTML mode", () => {
    expect(attributeValue("translate", true, false)).toBe("true");
    expect(attributeValue("translate", false, false)).toBe("false");
  });

  test("stringifies non-boolean properties", () => {
    expect(attributeValue("class", "button", true)).toBe("button");
    expect(attributeValue("tabindex", 0, true)).toBe("0");
    expect(attributeValue("tabindex", -1, true)).toBe("-1");
    expect(attributeValue("aria-hidden", true, true)).toBe("true");
    expect(attributeValue("aria-hidden", false, true)).toBe("false");
  });
});

describe("sourceAttributeValue", () => {
  test("returns strings immediately for static fast path", () => {
    expect(sourceAttributeValue("class", "button", false)).toBe("button");
    expect(sourceAttributeValue("class", "button", true)).toBe("button");
    expect(sourceAttributeValue("disabled", "disabled", false)).toBe(
      "disabled",
    );
  });

  test("returns undefined for nullish values", () => {
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", undefined, true)).toBeUndefined();
  });

  test("handles HTML boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
  });

  test("respects SOURCE_BOOLEAN_EXCLUSIONS", () => {
    // alpha is excluded from boolean list for source attributes
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");
    expect(sourceAttributeValue("alpha", "", true)).toBe("");
  });

  test("respects SOURCE_BOOLEAN_ADDITIONS", () => {
    // indeterminate is added to boolean list for source attributes
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("handles hidden attribute dynamically", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "", true)).toBe("");
    // "until-found" bypasses boolean logic and stringifies
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles translate attribute mapping", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    // translate is not a boolean attribute itself, but mapped
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });

  test("stringifies regular attributes dynamically", () => {
    expect(sourceAttributeValue("class", 0, true)).toBe("0");
    expect(sourceAttributeValue("data-value", true, true)).toBe("true");
    expect(sourceAttributeValue("data-value", false, true)).toBe("false");

    // non-dynamic fast path doesn't apply to non-strings
    expect(sourceAttributeValue("class", 0, false)).toBe("0");
  });

  test("case sensitive check for source attributes", () => {
    // sourceAttributeValue does not lowercase the attribute name
    expect(sourceAttributeValue("DISABLED", true, true)).toBe("true"); // not treated as boolean
  });
});
