import { describe, expect, test } from "bun:test";
import { checkPackageManifest } from "./check-packages";

describe("package policy", () => {
  test("requires four gates and ESM", () => {
    expect(checkPackageManifest("packages/core/package.json")).toEqual([]);
  });
});
