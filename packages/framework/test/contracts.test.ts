import { expect, test } from "bun:test";
import { defineConfig, defineRoute, MANIFEST_VERSION } from "../src";

test("contracts preserve exact input and version one", () => {
  const route = defineRoute({
    id: "home",
    path: "/",
    file: "src/routes/index.tsx",
  });
  expect(route.path).toBe("/");
  expect(defineConfig({ mode: "auto" }).mode).toBe("auto");
  expect(MANIFEST_VERSION).toBe(1);
});
