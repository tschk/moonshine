import { expect, test, describe } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

describe("attributeValue", () => {
  describe("html elements", () => {
    test("handles boolean attributes", () => {
      expect(attributeValue("disabled", true, true)).toBe("");
      expect(attributeValue("disabled", false, true)).toBe(undefined);
      expect(attributeValue("disabled", "", true)).toBe("");
      expect(attributeValue("disabled", "disabled", true)).toBe("disabled");
      expect(attributeValue("disabled", null, true)).toBe(undefined);
      expect(attributeValue("disabled", undefined, true)).toBe(undefined);
      expect(attributeValue("DiSaBlEd", true, true)).toBe(""); // case-insensitive
    });

    test("handles hidden attribute", () => {
      expect(attributeValue("hidden", true, true)).toBe("");
      expect(attributeValue("hidden", false, true)).toBe(undefined);
      expect(attributeValue("hidden", "", true)).toBe("");
      expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
      expect(attributeValue("hidden", "hidden", true)).toBe("hidden");
    });

    test("handles translate attribute", () => {
      expect(attributeValue("translate", true, true)).toBe("yes");
      expect(attributeValue("translate", false, true)).toBe("no");
      expect(attributeValue("translate", "yes", true)).toBe("yes");
      expect(attributeValue("translate", null, true)).toBe(undefined);
    });

    test("handles regular attributes", () => {
      expect(attributeValue("class", "btn", true)).toBe("btn");
      expect(attributeValue("class", "", true)).toBe("");
      expect(attributeValue("class", 123, true)).toBe("123");
      expect(attributeValue("class", null, true)).toBe(undefined);
      expect(attributeValue("class", undefined, true)).toBe(undefined);
      expect(attributeValue("class", false, true)).toBe("false");
    });
  });

  describe("non-html elements (svg/mathml)", () => {
    test("treats boolean attributes as strings", () => {
      expect(attributeValue("disabled", true, false)).toBe("true");
      expect(attributeValue("disabled", false, false)).toBe("false");
      expect(attributeValue("disabled", "", false)).toBe("");
      expect(attributeValue("hidden", true, false)).toBe("true");
    });

    test("treats translate attribute as string", () => {
      expect(attributeValue("translate", true, false)).toBe("true");
      expect(attributeValue("translate", false, false)).toBe("false");
    });
  });
});

describe("sourceAttributeValue", () => {
  test("returns static strings directly", () => {
    expect(sourceAttributeValue("class", "btn", false)).toBe("btn");
    expect(sourceAttributeValue("disabled", "true", false)).toBe("true");
  });

  test("handles dynamic normal attributes", () => {
    expect(sourceAttributeValue("class", "btn", true)).toBe("btn");
    expect(sourceAttributeValue("class", 123, true)).toBe("123");
    expect(sourceAttributeValue("class", null, true)).toBe(undefined);
    expect(sourceAttributeValue("class", false, true)).toBe("false");
  });

  test("handles boolean attributes", () => {
    expect(sourceAttributeValue("disabled", true, true)).toBe("");
    expect(sourceAttributeValue("disabled", false, true)).toBe(undefined);
    expect(sourceAttributeValue("disabled", "", true)).toBe("");
    expect(sourceAttributeValue("disabled", "disabled", true)).toBe("");
    expect(sourceAttributeValue("disabled", null, true)).toBe(undefined);
    expect(sourceAttributeValue("disabled", undefined, true)).toBe(undefined);
  });

  test("handles boolean exclusions", () => {
    // alpha is excluded from boolean in sourceAttributeValue
    expect(sourceAttributeValue("alpha", true, true)).toBe("true");
    expect(sourceAttributeValue("alpha", false, true)).toBe("false");
    expect(sourceAttributeValue("alpha", null, true)).toBe(undefined);
  });

  test("handles boolean additions", () => {
    // indeterminate is added to boolean in sourceAttributeValue
    expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
    expect(sourceAttributeValue("indeterminate", false, true)).toBe(undefined);
    expect(sourceAttributeValue("indeterminate", "", true)).toBe("");
  });

  test("handles hidden attribute", () => {
    expect(sourceAttributeValue("hidden", true, true)).toBe("");
    expect(sourceAttributeValue("hidden", false, true)).toBe(undefined);
    expect(sourceAttributeValue("hidden", "", true)).toBe("");
    expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
      "until-found",
    );
  });

  test("handles translate attribute", () => {
    expect(sourceAttributeValue("translate", true, true)).toBe("yes");
    expect(sourceAttributeValue("translate", false, true)).toBe("no");
    expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
    expect(sourceAttributeValue("translate", null, true)).toBe(undefined);
  });
});
