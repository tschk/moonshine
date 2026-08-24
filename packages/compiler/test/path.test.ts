import { describe, expect, test } from "bun:test";
import { toPosix } from "../src/path";

describe("toPosix", () => {
  test("converts Windows paths to POSIX paths", () => {
    expect(toPosix("C:\\Users\\John\\Documents\\file.txt")).toBe(
      "C:/Users/John/Documents/file.txt",
    );
  });

  test("preserves already correct POSIX paths", () => {
    expect(toPosix("/usr/local/bin/node")).toBe("/usr/local/bin/node");
  });

  test("handles empty strings", () => {
    expect(toPosix("")).toBe("");
  });

  test("handles mixed slashes", () => {
    expect(toPosix("foo\\bar/baz\\qux")).toBe("foo/bar/baz/qux");
  });

  test("handles consecutive backslashes", () => {
    expect(toPosix("\\\\server\\share\\folder")).toBe("//server/share/folder");
  });

  test("handles trailing and leading backslashes", () => {
    expect(toPosix("\\foo\\bar\\")).toBe("/foo/bar/");
  });
});
