import { describe, expect, test } from "bun:test";
import { toPosix } from "../src/path.js";

describe("toPosix", () => {
  test("leaves posix paths alone", () => {
    expect(toPosix("a/b/c")).toBe("a/b/c");
  });

  test("replaces backslashes with forward slashes", () => {
    expect(toPosix("a\\b\\c")).toBe("a/b/c");
  });

  test("handles mixed paths", () => {
    expect(toPosix("a\\b/c")).toBe("a/b/c");
  });

  test("handles empty string", () => {
    expect(toPosix("")).toBe("");
  });
});
