import { describe, expect, test } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes.js";

describe("attributeValue", () => {
  test("handles boolean attributes", () => {
    expect(attributeValue("disabled", true, true)).toBe("");
    expect(attributeValue("disabled", false, true)).toBeUndefined();
    expect(attributeValue("disabled", "", true)).toBe("");
    expect(attributeValue("disabled", null, true)).toBeUndefined();
    expect(attributeValue("disabled", undefined, true)).toBeUndefined();
    expect(attributeValue("disabled", 0, true)).toBeUndefined(); // test 0 as well
    expect(attributeValue("disabled", "disabled", true)).toBe("disabled");
  });

  test("handles hidden attribute specifically", () => {
    expect(attributeValue("hidden", true, true)).toBe("");
    expect(attributeValue("hidden", false, true)).toBeUndefined();
    expect(attributeValue("hidden", "", true)).toBe("");
    expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
  });

  test("handles translate attribute specifically", () => {
    expect(attributeValue("translate", true, true)).toBe("yes");
    expect(attributeValue("translate", false, true)).toBe("no");
    expect(attributeValue("translate", "yes", true)).toBe("yes");
    expect(attributeValue("translate", "no", true)).toBe("no");
    expect(attributeValue("translate", "", true)).toBe("");
  });

  test("handles non-HTML boolean attributes", () => {
    // When html is false, even boolean attributes are treated as normal strings
    expect(attributeValue("disabled", true, false)).toBe("true");
    expect(attributeValue("disabled", false, false)).toBe("false");
    expect(attributeValue("disabled", null, false)).toBeUndefined();
  });

  test("handles regular attributes", () => {
    expect(attributeValue("class", "foo", true)).toBe("foo");
    expect(attributeValue("class", "", true)).toBe("");
    expect(attributeValue("class", null, true)).toBeUndefined();
    expect(attributeValue("class", undefined, true)).toBeUndefined();
    expect(attributeValue("class", 0, true)).toBe("0");
    expect(attributeValue("class", false, true)).toBe("false");
  });
});

describe("sourceAttributeValue", () => {
  test("returns string early if not dynamic", () => {
    expect(sourceAttributeValue("disabled", "false", false)).toBe("false");
  });

  test("handles HTML boolean attributes for source", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBeUndefined();
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
    expect(sourceAttributeValue("disabled", null, true)).toBeUndefined();

    // SOURCE_BOOLEAN_ADDITIONS
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBeUndefined();

    // SOURCE_BOOLEAN_EXCLUSIONS (treated as normal attributes)
    expect(sourceAttributeValue("itemscope", true, true)).toBe("true");
    expect(sourceAttributeValue("itemscope", false, true)).toBe("false");
  });

  test("handles hidden attribute specifically for source", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();
    expect(sourceAttributeValue("hidden", "", true)).toBe("");
    // 'until-found' is not treated as boolean for source logic because condition requires value !== 'until-found'
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles translate attribute specifically for source", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
  });

  test("handles regular attributes for source", () => {
    expect(sourceAttributeValue("class", "foo", true)).toBe("foo");
    expect(sourceAttributeValue("class", "", true)).toBe("");
    expect(sourceAttributeValue("class", null, true)).toBeUndefined();
    expect(sourceAttributeValue("class", 0, true)).toBe("0");
    expect(sourceAttributeValue("class", false, true)).toBe("false");
  });
});
