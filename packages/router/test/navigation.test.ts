import { describe, expect, test } from "bun:test";
import { splitLocation, safeHref, isExternal } from "../src/navigation";

describe("splitLocation", () => {
  test("splits path and query", () => {
    expect(splitLocation("/path?query=1")).toEqual(["/path", "query=1"]);
  });
  test("handles no query string", () => {
    expect(splitLocation("/path")).toEqual(["/path", ""]);
  });
  test("handles empty string", () => {
    expect(splitLocation("")).toEqual(["", ""]);
  });
  test("handles query string only", () => {
    expect(splitLocation("?query=1")).toEqual(["", "query=1"]);
  });
  test("handles multiple question marks by splitting on the first", () => {
    expect(splitLocation("/path?query=1?other=2")).toEqual([
      "/path",
      "query=1?other=2",
    ]);
  });
});

describe("safeHref", () => {
  test("allows safe schemes", () => {
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("mailto:user@example.com")).toBe("mailto:user@example.com");
    expect(safeHref("tel:+1234567890")).toBe("tel:+1234567890");
    expect(safeHref("ftp://example.com")).toBe("ftp://example.com");
  });
  test("allows relative paths", () => {
    expect(safeHref("/path")).toBe("/path");
    expect(safeHref("?query=1")).toBe("?query=1");
    expect(safeHref("#hash")).toBe("#hash");
    expect(safeHref("path")).toBe("path");
  });
  test("rewrites unsafe schemes to #", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("vbscript:msgbox(1)")).toBe("#");
    expect(safeHref("data:text/html,<h1>hello</h1>")).toBe("#");
  });
  test("strips control characters to prevent evasion", () => {
    expect(safeHref("java\x09script:alert(1)")).toBe("#");
    expect(safeHref("java\nscript:alert(1)")).toBe("#");
  });
  test("handles empty string and spaces", () => {
    expect(safeHref("")).toBe("#");
    expect(safeHref("   ")).toBe("#");
  });
  test("handles case-insensitive schemes", () => {
    expect(safeHref("HTTP://example.com")).toBe("HTTP://example.com");
    expect(safeHref("JaVaScRiPt:alert(1)")).toBe("#");
  });
  test("handles schemes with special characters (+, -, .)", () => {
    expect(safeHref("git+ssh://example.com")).toBe("#");
    expect(safeHref("my-app:123")).toBe("#");
    expect(safeHref("my.app:123")).toBe("#");
  });
  test("treats strings starting with numbers as relative paths", () => {
    expect(safeHref("1scheme:123")).toBe("1scheme:123");
  });
  test("allows protocol-relative URLs", () => {
    expect(safeHref("//example.com")).toBe("//example.com");
  });
  test("strips extensive control characters", () => {
    expect(safeHref("\u0000javascript:alert(1)")).toBe("#");
    expect(safeHref("java\u000Bscript:alert(1)")).toBe("#");
    expect(safeHref("java\rscript:alert(1)")).toBe("#");
  });
});

describe("isExternal", () => {
  test("identifies scheme-bearing URLs as external", () => {
    expect(isExternal("http://example.com")).toBe(true);
    expect(isExternal("https://example.com")).toBe(true);
    expect(isExternal("mailto:test@test.com")).toBe(true);
  });
  test("identifies protocol-relative URLs as external", () => {
    expect(isExternal("//example.com")).toBe(true);
  });
  test("identifies hash-only URLs as external (browser handles them)", () => {
    expect(isExternal("#section")).toBe(true);
  });
  test("identifies target other than _self as external", () => {
    expect(isExternal("/path", "_blank")).toBe(true);
    expect(isExternal("/path", "_parent")).toBe(true);
  });
  test("identifies same-document relative paths as internal", () => {
    expect(isExternal("/path")).toBe(false);
    expect(isExternal("path")).toBe(false);
    expect(isExternal("/path?query=1")).toBe(false);
    expect(isExternal("/path", "_self")).toBe(false);
  });
});

test("download presence leaves navigation to browser", () => {
  for (const value of [true, "", "file.txt"])
    expect(isExternal("/file", undefined, value)).toBe(true);
  for (const value of [false, null, undefined])
    expect(isExternal("/file", undefined, value)).toBe(false);
});
