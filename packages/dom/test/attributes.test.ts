import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  test("returns undefined for null or undefined values", () => {
    expect(attributeValue("id", null, true)).toBeUndefined();
    expect(attributeValue("id", undefined, true)).toBeUndefined();
  });

  test("returns string representation for non-boolean attributes", () => {
    expect(attributeValue("id", "my-id", true)).toBe("my-id");
    expect(attributeValue("tabindex", 0, true)).toBe("0");
    expect(attributeValue("class", "btn", true)).toBe("btn");
  });

  test("handles boolean HTML attributes correctly", () => {
    // Truthy values
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", "true", true)).toBe("true");
    expect(attributeValue("disabled", "", true)).toBe("");

    // Falsy value (excluding "")
    expect(attributeValue("disabled", false, true)).toBeUndefined();
  });

  test("handles boolean HTML attributes case-insensitively", () => {
    expect(attributeValue("DISABLED", true, true)).toBe("");
    expect(attributeValue("ReAdOnLy", true, true)).toBe("");
  });

  test("handles 'hidden' attribute specifically", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
    expect(attributeValue("HIDDEN", "until-found", true)).toBe("until-found");
  });

  test("ignores HTML semantics when html is false", () => {
    // When html=false, 'disabled' is treated as a normal attribute
    expect(attributeValue("disabled", true, false)).toBe("true"); // boolean and value === true returns "", but here boolean is false, so String(true) -> "true"
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("disabled", null, false)).toBeUndefined();
  });

  test("handles 'translate' attribute boolean conversion", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    // When html=false, it does not convert
    expect(attributeValue("translate", true, false)).toBe("true");
  });
});

describe("sourceAttributeValue", () => {
  test("fast path for non-dynamic literal strings", () => {
    expect(sourceAttributeValue("class", "btn", false)).toBe("btn");
    expect(sourceAttributeValue("disabled", "true", false)).toBe("true");
  });

  test("returns undefined for null or undefined values", () => {
    expect(sourceAttributeValue("id", null, true)).toBeUndefined();
    expect(sourceAttributeValue("id", undefined, true)).toBeUndefined();
  });

  test("handles standard boolean attributes (dynamic)", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
    expect(sourceAttributeValue("disabled", "disabled", true)).toBe("");
  });

  test("is case sensitive", () => {
    // SOURCE_BOOLEAN_ADDITIONS/EXCLUSIONS and BOOLEAN check the exact case
    expect(sourceAttributeValue("DISABLED", true, true)).toBe("true"); // Not matched as boolean
  });

  test("handles SOURCE_BOOLEAN_ADDITIONS", () => {
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();
  });

  test("handles SOURCE_BOOLEAN_EXCLUSIONS", () => {
    expect(sourceAttributeValue("itemscope", true, true)).toBe("true"); // Treated as non-boolean
    expect(sourceAttributeValue("shadowrootclonable", true, true)).toBe("true");
  });

  test("handles 'hidden' attribute specifically", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles 'translate' attribute boolean conversion", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });
});
