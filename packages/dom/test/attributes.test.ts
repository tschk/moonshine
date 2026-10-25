import { expect, test } from "bun:test";
import { attributeValue, sourceAttributeValue } from "../src/attributes";

test("attributeValue handles generic attributes", () => {
  expect(attributeValue("class", "test", true)).toBe("test");
  expect(attributeValue("class", null, true)).toBeUndefined();
  expect(attributeValue("class", undefined, true)).toBeUndefined();
  expect(attributeValue("class", 0, true)).toBe("0");
  expect(attributeValue("class", false, true)).toBe("false");
});

test("attributeValue handles boolean HTML attributes", () => {
  expect(attributeValue("checked", true, true)).toBe("");
  expect(attributeValue("checked", false, true)).toBeUndefined();
  expect(attributeValue("checked", "", true)).toBe("");
  expect(attributeValue("checked", "checked", true)).toBe("checked");

  expect(attributeValue("checked", true, false)).toBe("true"); // non-html
  expect(attributeValue("checked", false, false)).toBe("false");

  expect(attributeValue("hidden", true, true)).toBe("");
  expect(attributeValue("hidden", "until-found", true)).toBe("until-found");
  expect(attributeValue("hidden", false, true)).toBeUndefined();
  expect(attributeValue("hidden", "", true)).toBe("");
});

test("attributeValue handles translate attribute", () => {
  expect(attributeValue("translate", true, true)).toBe("yes");
  expect(attributeValue("translate", false, true)).toBe("no");
  expect(attributeValue("translate", "yes", true)).toBe("yes");
  expect(attributeValue("translate", true, false)).toBe("true"); // non-html
});

test("sourceAttributeValue handles fast path strings", () => {
  expect(sourceAttributeValue("class", "test", false)).toBe("test");
  expect(sourceAttributeValue("class", "test", true)).toBe("test");
  expect(sourceAttributeValue("class", null, true)).toBeUndefined();
  expect(sourceAttributeValue("class", 0, true)).toBe("0");
});

test("sourceAttributeValue handles boolean attributes and exclusions", () => {
  expect(sourceAttributeValue("checked", true, true)).toBe("");
  expect(sourceAttributeValue("checked", false, true)).toBeUndefined();
  expect(sourceAttributeValue("checked", "", true)).toBe("");
  expect(sourceAttributeValue("checked", "checked", true)).toBe("");

  expect(sourceAttributeValue("hidden", true, true)).toBe("");
  expect(sourceAttributeValue("hidden", "until-found", true)).toBe(
    "until-found",
  );
  expect(sourceAttributeValue("hidden", false, true)).toBeUndefined();

  // Test exclusions
  expect(sourceAttributeValue("alpha", true, true)).toBe("true");
  expect(sourceAttributeValue("shadowrootclonable", true, true)).toBe("true");

  // Test additions
  expect(sourceAttributeValue("indeterminate", true, true)).toBe("");
  expect(sourceAttributeValue("seamless", true, true)).toBe("");
});

test("sourceAttributeValue handles translate attribute", () => {
  expect(sourceAttributeValue("translate", true, true)).toBe("yes");
  expect(sourceAttributeValue("translate", false, true)).toBe("no");
  expect(sourceAttributeValue("translate", "yes", true)).toBe("yes");
});
